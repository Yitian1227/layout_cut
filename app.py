from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
from typing import Optional
import threading
import time
import uuid
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator, SamPredictor
from segment_anything.utils.transforms import ResizeLongestSide
import torch
from PIL import Image
import numpy as np
import base64
from io import BytesIO
import os
import cv2
import json

# --- Vertex AI：憑證須在 import vertexai 之前設定 GOOGLE_APPLICATION_CREDENTIALS ---
_APP_DIR = os.path.dirname(os.path.abspath(__file__))
VERTEX_KEY_FILE = os.path.join(_APP_DIR, "vertex-key.json")
VERTEX_AI_PROJECT = "gen-lang-client-0245057021"
VERTEX_AI_LOCATION = "us-central1"
vertexai_initialized = False
# Veo / 影片生成使用 google.genai Client（Vertex 模式），見官方 Image-to-Video 文件
genai_client = None

# 供 Veo 請求額外參數（SDK 的 GenerateVideosConfig 未宣告 safety_settings，改由 mapper 補上）
_veo_tls = threading.local()
_veo_safety_mapper_installed = False


def _install_veo_generate_videos_safety_patch() -> None:
    """將 safetySettings 寫入 Vertex predict 的 parameters（google-genai 預設未映射）。"""
    global _veo_safety_mapper_installed
    if _veo_safety_mapper_installed:
        return
    from google.genai.models import (
        _GenerateVideosConfig_to_vertex as _orig_gv_cfg,
        getv,
        setv,
    )

    def _wrapped(from_object, parent_object=None, root_object=None):
        to_object = _orig_gv_cfg(from_object, parent_object, root_object)
        extra = getattr(_veo_tls, "safety_settings", None)
        if extra and parent_object is not None:
            setv(parent_object, ["parameters", "safetySettings"], list(extra))
        return to_object

    import google.genai.models as genai_models

    genai_models._GenerateVideosConfig_to_vertex = _wrapped
    _veo_safety_mapper_installed = True
    print("已為 Veo 啟用 safetySettings 請求映射（parameters.safetySettings）")


if os.path.isfile(VERTEX_KEY_FILE):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(VERTEX_KEY_FILE)
    try:
        import vertexai

        vertexai.init(project=VERTEX_AI_PROJECT, location=VERTEX_AI_LOCATION)
        vertexai_initialized = True
        print(
            f"Vertex AI 已初始化（project={VERTEX_AI_PROJECT}, location={VERTEX_AI_LOCATION}）"
        )
        from google import genai

        genai_client = genai.Client(
            vertexai=True,
            project=VERTEX_AI_PROJECT,
            location=VERTEX_AI_LOCATION,
        )
        print("Google GenAI Client（Vertex）已建立，可用於 Veo 影片生成")
        _install_veo_generate_videos_safety_patch()
    except Exception as e:
        print(f"Vertex AI / GenAI 初始化失敗: {e}")
else:
    print(f"警告: 未找到 {VERTEX_KEY_FILE}，Vertex AI（Veo）相關功能將無法使用")

# Veo 模型 ID（可依專案開通狀況調整，例如 veo-3.1-generate-001）
VEO_MODEL_ID = os.environ.get("VEO_MODEL_ID", "veo-2.0-generate-001")
# 若 Vertex 要求寫入 GCS，請設定環境變數，例如：gs://your-bucket/prefix/
VEO_OUTPUT_GCS_URI = os.environ.get("VEO_OUTPUT_GCS_URI", "").strip() or None
# 人物生成：dont_allow / allow_adult / allowAll（見 Vertex VideoGenerationModelParams；未設時與 API 預設一致）
VEO_PERSON_GENERATION = os.environ.get("VEO_PERSON_GENERATION", "allow_adult").strip()
# 安全閾值：BLOCK_ONLY_HIGH 等（仍受 Veo 後台政策限制，與人物偵測無關）
VEO_SAFETY_BLOCK_THRESHOLD = os.environ.get(
    "VEO_SAFETY_BLOCK_THRESHOLD", "BLOCK_ONLY_HIGH"
).strip()


def _veo_resolve_safety_block_threshold() -> str:
    """回傳 Vertex / Gemini 可辨識的門檻字串（google.genai HarmBlockThreshold）。"""
    th = (VEO_SAFETY_BLOCK_THRESHOLD or "BLOCK_ONLY_HIGH").strip()
    allowed = (
        "BLOCK_NONE",
        "OFF",
        "BLOCK_ONLY_HIGH",
        "BLOCK_MEDIUM_AND_ABOVE",
        "BLOCK_LOW_AND_ABOVE",
    )
    return th if th in allowed else "BLOCK_ONLY_HIGH"


def _veo_safety_include_image_categories() -> bool:
    """是否額外帶入 IMAGE_* harm 類別（需明確設定環境變數才啟用）。"""
    v = os.environ.get("VEO_SAFETY_INCLUDE_IMAGE_CATEGORIES", "").strip().lower()
    return v in ("1", "true", "yes")


def _veo_safety_settings_as_genai_types() -> list[dict]:
    """以 SDK SafetySetting 建立，與 GenerateContent 等 API 一致，再轉成 dict 供 mapper 使用。"""
    from google.genai.types import HarmBlockThreshold, HarmCategory, SafetySetting

    th_raw = _veo_resolve_safety_block_threshold()
    try:
        threshold = HarmBlockThreshold(th_raw)
    except ValueError:
        threshold = HarmBlockThreshold.BLOCK_ONLY_HIGH

    pairs = [
        (HarmCategory.HARM_CATEGORY_HARASSMENT, threshold),
        (HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold),
        (HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold),
        (HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold),
    ]
    if _veo_safety_include_image_categories():
        pairs.extend(
            [
                (HarmCategory.HARM_CATEGORY_IMAGE_HARASSMENT, threshold),
                (HarmCategory.HARM_CATEGORY_IMAGE_HATE, threshold),
                (HarmCategory.HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT, threshold),
                (HarmCategory.HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT, threshold),
            ]
        )
    out = [
        SafetySetting(category=c, threshold=t) for c, t in pairs
    ]
    return [s.model_dump(mode="json", exclude_none=True) for s in out]


def _veo_debug_predict_request_json(
    *,
    model_id: str,
    prompt: str,
    image_bytes: bytes,
    image_mime: str,
    config_kwargs: dict,
    safety_settings: list[dict],
    person_generation: str,
) -> dict:
    """還原約略的 Vertex predictLongRunning JSON（圖片僅標註長度，避免洗版）。"""
    b64_len = len(base64.b64encode(image_bytes)) if image_bytes else 0
    p = {
        "sampleCount": config_kwargs.get("number_of_videos", 1),
        "durationSeconds": config_kwargs.get("duration_seconds"),
        "aspectRatio": config_kwargs.get("aspect_ratio"),
        "personGeneration": person_generation,
        "safetySettings": safety_settings,
    }
    if config_kwargs.get("output_gcs_uri"):
        p["storageUri"] = config_kwargs["output_gcs_uri"]
    if config_kwargs.get("fps") is not None:
        p["fps"] = config_kwargs["fps"]
    if config_kwargs.get("seed") is not None:
        p["seed"] = config_kwargs["seed"]
    p = {k: v for k, v in p.items() if v is not None}
    return {
        "model": model_id,
        "instances": [
            {
                "prompt": prompt,
                "image": {
                    "mimeType": image_mime,
                    "bytesBase64Encoded": f"<omitted, raw_image_bytes={len(image_bytes)}, approx_b64_len={b64_len}>",
                },
            }
        ],
        "parameters": p,
    }


def _veo_print_request_debug(label: str, payload: dict) -> None:
    print(f"\n=== Veo 請求除錯 ({label}) ===\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n=== 結束 ===\n")


# 非同步影片任務（記憶體內；重啟服務後 job_id 失效）
_video_jobs_lock = threading.Lock()
_video_jobs: dict = {}

# 輪詢 Google 長時間作業的間隔（秒）
_VEO_POLL_INTERVAL_SEC = 8


# 全局變數存儲模型
sam = None
mask_generator = None
predictor = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """在應用啟動時載入 SAM 模型"""
    global sam, mask_generator, predictor
    try:
        # 載入模型
        model_path = "./models/sam_vit_b_01ec64.pth"
        if not os.path.exists(model_path):
            print(f"警告: 模型文件不存在: {model_path}")
            print("服務將啟動，但無法進行圖片分割")
        else:
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            sam = sam_model_registry["vit_b"](checkpoint=model_path)
            sam.to(device=device)
            # 平衡速度與覆蓋率；無 GPU 時全圖自動分割仍可能較慢
            mask_generator = SamAutomaticMaskGenerator(
                sam,
                points_per_side=32,
                pred_iou_thresh=0.80,
                stability_score_thresh=0.88,
                crop_n_layers=0,
                crop_n_points_downscale_factor=2,
                min_mask_region_area=0,
            )
            predictor = SamPredictor(sam)
            print(f"SAM 模型載入成功，裝置: {device}")
    except Exception as e:
        print(f"載入模型時發生錯誤: {e}")
        print("服務將啟動，但無法進行圖片分割")

    print(
        "提示：/generate-video 任務存在於單一進程記憶體。請勿使用多 Worker；"
        "開發時若使用 uvicorn --reload，檔案變更重載後舊 job_id 會失效，需重新生成。"
    )

    yield
    
    # 清理資源（如果需要）
    print("應用關閉")

app = FastAPI(lifespan=lifespan)

# CORS middleware（開發模式：允許所有來源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def mask_to_rle(segmentation: np.ndarray) -> dict:
    """
    將 boolean / 0-1 mask 轉成簡單 RLE（run-length encoding），以減少傳輸量。
    格式為：
    {
        "size": [height, width],
        "counts": [run1, run2, ...]  # 按照 COCO 慣例，從第一個像素開始的連續長度交替表示 0/1
    }
    """
    if segmentation.dtype != np.uint8 and segmentation.dtype != bool:
        segmentation = segmentation.astype(np.uint8)

    # 轉成 0/1 並攤平成一維向量（row-major）
    if segmentation.dtype == bool:
        arr = segmentation.astype(np.uint8)
    else:
        arr = (segmentation > 0).astype(np.uint8)

    h, w = arr.shape[:2]
    flat = arr.reshape(-1)

    # RLE 編碼
    counts = []
    prev = 0
    run_len = 0

    for v in flat:
        if v == prev:
            run_len += 1
        else:
            counts.append(run_len)
            run_len = 1
            prev = v

    counts.append(run_len)

    return {
        "size": [int(h), int(w)],
        "counts": [int(c) for c in counts],
    }


def mask_to_polygon_flat(segmentation: np.ndarray) -> list:
    """
    從二值 / bool mask 擷取最外層輪廓，回傳 Konva Line 可用的平坦座標 [x1,y1,x2,y2,...]。
    若無有效輪廓則回傳空 list。
    """
    if segmentation is None or segmentation.size == 0:
        return []

    if segmentation.dtype == bool:
        mask_u8 = (segmentation.astype(np.uint8)) * 255
    else:
        mask_u8 = (segmentation > 0).astype(np.uint8) * 255

    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    main = max(contours, key=cv2.contourArea)
    if cv2.contourArea(main) < 1:
        return []

    peri = cv2.arcLength(main, True)
    epsilon = max(0.5, 0.001 * peri)
    approx = cv2.approxPolyDP(main, epsilon, True)

    if approx is None or len(approx) < 3:
        return []

    flat = approx.reshape(-1).astype(int).tolist()
    return [int(v) for v in flat]


@app.post("/segment-everything")
async def segment_everything(
    file: UploadFile = File(...),
    max_masks: int = 100,
    min_area: int = 0,
):
    """
    使用 SAM 的 SamAutomaticMaskGenerator 對整張圖片做自動分割（Segment Everything）。
    回傳每個物件的：
    - bbox: [x, y, w, h]
    - area: 像素數
    - score / stability_score
    - rle: 輕量化的 RLE mask（size + counts）
    - polygon: 輪廓平坦座標 [x1, y1, x2, y2, ...]（供前端 Konva.Line 繪製貼邊外框）

    參數：
    - max_masks: 最多回傳幾個物件（依 score 排序，預設 100）
    - min_area: 最小面積（像素）門檻，小於此值的物件會被過濾，預設 0 不過濾
    """
    # 檢查模型是否載入
    if mask_generator is None:
        raise HTTPException(status_code=503, detail="模型尚未載入，請檢查模型文件是否存在")

    # 檢查檔案類型
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="只接受圖片文件")

    try:
        # 讀取圖片並轉為 RGB numpy array
        image_data = await file.read()
        image = Image.open(BytesIO(image_data))
        image = image.convert("RGB")
        image_array = np.array(image)

        # 產生所有 masks（自動分割）
        # SamAutomaticMaskGenerator 會回傳一個 list，裡面每個元素是 dict，例如：
        # {
        #   'segmentation': numpy.bool_[H, W],
        #   'area': int,
        #   'bbox': [x, y, w, h],
        #   'predicted_iou': float,
        #   'stability_score': float,
        #   ...
        # }
        masks = mask_generator.generate(image_array)

        # 依 score 排序（predicted_iou 為主），由大到小
        masks_sorted = sorted(
            masks,
            key=lambda m: float(m.get("predicted_iou", m.get("stability_score", 0.0))),
            reverse=True,
        )

        results = []
        for m in masks_sorted:
            area = int(m.get("area", 0))
            if min_area > 0 and area < min_area:
                continue

            segmentation = m["segmentation"]  # bool mask
            bbox = m.get("bbox", None)

            if bbox is None:
                # 若 bbox 不存在，從 segmentation 推出一個 bbox
                ys, xs = np.where(segmentation)
                if len(xs) == 0 or len(ys) == 0:
                    continue
                x_min, x_max = xs.min(), xs.max()
                y_min, y_max = ys.min(), ys.max()
                bbox = [
                    int(x_min),
                    int(y_min),
                    int(x_max - x_min + 1),
                    int(y_max - y_min + 1),
                ]

            # 轉成 RLE，減少資料量
            rle = mask_to_rle(segmentation)
            polygon = mask_to_polygon_flat(segmentation)

            result = {
                "bbox": [int(v) for v in bbox],
                "area": area,
                "score": float(m.get("predicted_iou", 0.0)),
                "stability_score": float(m.get("stability_score", 0.0)),
                "rle": rle,
                "polygon": polygon,
            }
            results.append(result)

            if len(results) >= max_masks:
                break

        return {"masks": results}

    except HTTPException:
        raise
    except Exception as e:
        print(f"處理圖片時發生錯誤（segment-everything）: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"處理圖片時發生錯誤（segment-everything）: {str(e)}",
        )

@app.post("/segment-image")
async def segment_image(file: UploadFile = File(...)):
    """
    接收圖片並進行自動分割
    返回分割後的 mask 列表（base64 編碼的 PNG 圖片）
    """
    # 檢查模型是否已載入
    if mask_generator is None:
        raise HTTPException(status_code=503, detail="模型尚未載入，請檢查模型文件是否存在")
    
    # 檢查文件類型
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="只接受圖片文件")
    
    try:
        # 讀取圖片並轉換為 RGB numpy array
        image_data = await file.read()
        image = Image.open(BytesIO(image_data))
        image = image.convert('RGB')
        image_array = np.array(image)
        
        # 執行分割
        masks = mask_generator.generate(image_array)
        
        # 將每個 mask 轉換為 base64 PNG（彩色物件 + 透明背景）
        # 只保留物件實際存在的範圍（最小包圍盒）
        mask_list = []
        for mask_data in masks:
            segmentation = mask_data['segmentation']  # bool array
            
            # 計算最小包圍盒（bounding box）
            # 找到所有 mask 為 True 的像素位置
            rows = np.any(segmentation, axis=1)
            cols = np.any(segmentation, axis=0)
            
            if not np.any(rows) or not np.any(cols):
                # 如果 mask 為空，跳過
                continue
            
            # 計算邊界
            y_min, y_max = np.where(rows)[0][[0, -1]]
            x_min, x_max = np.where(cols)[0][[0, -1]]
            
            # 記錄偏移量（相對於原圖的偏移）
            offset_x = int(x_min)
            offset_y = int(y_min)
            
            # 計算裁切區域的寬高
            crop_width = int(x_max - x_min + 1)
            crop_height = int(y_max - y_min + 1)
            
            # 裁切原圖的 RGB 區域
            rgb_crop = image_array[y_min:y_max+1, x_min:x_max+1].copy()
            
            # 裁切 mask 區域
            mask_crop = segmentation[y_min:y_max+1, x_min:x_max+1]
            
            # 創建 alpha 通道：mask 為 True 的地方 alpha=255，False 的地方 alpha=0
            alpha_channel = (mask_crop * 255).astype(np.uint8)
            
            # 將 RGB 和 alpha 合併成 RGBA
            rgba_image = np.dstack([rgb_crop, alpha_channel])
            
            # 創建 RGBA 模式的 PIL Image
            pil_rgba = Image.fromarray(rgba_image, mode='RGBA')
            
            # 轉換為 base64
            buffer = BytesIO()
            pil_rgba.save(buffer, format='PNG')
            buffer.seek(0)
            base64_str = base64.b64encode(buffer.read()).decode('utf-8')
            base64_url = f"data:image/png;base64,{base64_str}"
            
            # 返回圖片和偏移量信息
            mask_list.append({
                "image": base64_url,
                "offsetX": offset_x,
                "offsetY": offset_y,
                "width": crop_width,
                "height": crop_height
            })
        
        return {"masks": mask_list}
    
    except Exception as e:
        print(f"處理圖片時發生錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"處理圖片時發生錯誤: {str(e)}")

def decode_base64_image(base64_string):
    """將 base64 字符串解碼為 numpy 數組"""
    # 移除 data URL 前綴（如果存在）
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    image_data = base64.b64decode(base64_string)
    image = Image.open(BytesIO(image_data))
    
    # 轉換為 numpy 數組
    image_array = np.array(image)
    
    # 確保返回的是正確的形狀
    # 如果是 RGBA，轉換為 RGB
    if len(image_array.shape) == 3 and image_array.shape[2] == 4:
        # RGBA -> RGB
        image_array = cv2.cvtColor(image_array, cv2.COLOR_RGBA2RGB)
    elif len(image_array.shape) == 3 and image_array.shape[2] == 3:
        # 已經是 RGB，保持不變
        pass
    elif len(image_array.shape) == 2:
        # 灰度圖，保持不變
        pass
    else:
        # 異常形狀，嘗試處理
        print(f"警告: decode_base64_image 收到異常形狀: {image_array.shape}")
        # 如果是 4D 或更高維度，嘗試重塑
        if len(image_array.shape) > 3:
            # 假設最後兩個維度是 H 和 W
            h, w = image_array.shape[-2], image_array.shape[-1]
            # 如果是 [1, 1, H, W] 或類似，重塑為 [H, W]
            if image_array.size == h * w:
                image_array = image_array.reshape(h, w)
            elif image_array.size == h * w * 3:
                image_array = image_array.reshape(h, w, 3)
            else:
                raise ValueError(f"無法處理圖像形狀: {image_array.shape}")
    
    return image_array

def process_mask_to_binary(mask_image):
    """將 mask 圖像轉換為二值 mask（0 或 255）"""
    # 確保輸入是 numpy 數組
    if not isinstance(mask_image, np.ndarray):
        mask_image = np.array(mask_image)
    
    # 處理不同維度的輸入
    if len(mask_image.shape) == 2:
        # 已經是灰度圖，直接使用
        binary_mask = mask_image
    elif len(mask_image.shape) == 3:
        # 如果是彩色圖（RGB 或 RGBA），轉換為灰度
        if mask_image.shape[2] == 4:
            # RGBA 圖像，只使用 RGB 通道
            mask_image = mask_image[:, :, :3]
        if mask_image.shape[2] == 3:
            # RGB 圖像，轉換為灰度
            # 確保是 uint8 類型
            if mask_image.dtype != np.uint8:
                mask_image = np.clip(mask_image, 0, 255).astype(np.uint8)
            gray = cv2.cvtColor(mask_image, cv2.COLOR_RGB2GRAY)
            binary_mask = gray
        else:
            # 其他情況，取第一個通道
            binary_mask = mask_image[:, :, 0]
    else:
        # 如果維度不對，嘗試重塑
        print(f"警告: mask_image 形狀異常: {mask_image.shape}")
        # 如果是4D或更高，嘗試降維
        if len(mask_image.shape) == 4:
            # [1, H, W, C] 或 [B, H, W, C] -> [H, W, C]
            if mask_image.shape[0] == 1:
                mask_image = mask_image[0]
            else:
                mask_image = mask_image[0]  # 取第一個batch
            # 遞歸處理
            return process_mask_to_binary(mask_image)
        elif len(mask_image.shape) > 4:
            # 更高維度，嘗試重塑
            print(f"警告: mask_image 維度過高: {mask_image.shape}，嘗試降維")
            # 假設最後兩個維度是 H 和 W
            h, w = mask_image.shape[-2], mask_image.shape[-1]
            # 重塑為 [H, W]
            mask_image = mask_image.reshape(-1, h, w)[0]
            return process_mask_to_binary(mask_image)
        else:
            # 嘗試重塑為 2D
            if mask_image.size > 0:
                # 計算合理的 H 和 W
                total_pixels = mask_image.size
                # 假設是正方形或接近正方形
                side = int(np.sqrt(total_pixels))
                if side * side == total_pixels:
                    binary_mask = mask_image.reshape(side, side)
                else:
                    raise ValueError(f"無法處理 mask_image 形狀: {mask_image.shape}")
            else:
                raise ValueError(f"mask_image 為空或形狀異常: {mask_image.shape}")
    
    # 確保是 2D 數組
    if len(binary_mask.shape) != 2:
        raise ValueError(f"binary_mask 應該是 2D 數組，但得到形狀: {binary_mask.shape}")
    
    # 二值化：大於 127 的設為 255，否則為 0
    binary_mask = (binary_mask > 127).astype(np.uint8) * 255
    
    return binary_mask

@app.post("/segment-with-mask")
async def segment_with_mask(
    file: UploadFile = File(...),
    mask: str = Form(...),
    bbox: str = Form(None)
):
    """
    使用 mask 提示進行分割
    接收原始圖片和 mask（base64 編碼），返回分割結果
    """
    # 檢查模型是否已載入
    if predictor is None:
        raise HTTPException(status_code=503, detail="模型尚未載入，請檢查模型文件是否存在")
    
    # 檢查文件類型
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="只接受圖片文件")
    
    try:
        # 讀取原始圖像
        image_data = await file.read()
        image = Image.open(BytesIO(image_data))
        image = image.convert('RGB')
        image_array = np.array(image)
        
        # 讀取 mask
        mask_image = decode_base64_image(mask)
        
        # 調試：打印 mask_image 的形狀
        print(f"調試: mask_image 形狀: {mask_image.shape}, 圖像形狀: {image_array.shape}")
        
        # 將 mask 轉換為二值 mask（在調整大小之前）
        binary_mask = process_mask_to_binary(mask_image)
        
        # 確保 binary_mask 是 2D 數組 (H, W)
        # 如果仍然是3D或更高維度，強制轉換為2D
        if len(binary_mask.shape) > 2:
            print(f"警告: binary_mask 形狀異常: {binary_mask.shape}，嘗試轉換為2D")
            # 如果是3D，取第一個通道或轉換為灰度
            if len(binary_mask.shape) == 3:
                if binary_mask.shape[2] == 1:
                    binary_mask = binary_mask[:, :, 0]
                elif binary_mask.shape[2] == 3:
                    # RGB轉灰度
                    binary_mask = cv2.cvtColor(binary_mask.astype(np.uint8), cv2.COLOR_RGB2GRAY)
                else:
                    binary_mask = binary_mask[:, :, 0]
            else:
                # 更高維度，嘗試重塑
                total_elements = binary_mask.size
                h, w = image_array.shape[:2]
                if total_elements == h * w:
                    binary_mask = binary_mask.reshape(h, w)
                else:
                    raise HTTPException(status_code=400, detail=f"無法將 binary_mask 轉換為2D，形狀: {binary_mask.shape}")
        
        if len(binary_mask.shape) != 2:
            raise HTTPException(status_code=400, detail=f"binary_mask 應該是 2D 數組，但得到形狀: {binary_mask.shape}")
        
        # 確保 mask 與圖像尺寸一致（在 resize 之前）
        if binary_mask.shape[:2] != image_array.shape[:2]:
            binary_mask = cv2.resize(binary_mask, (image_array.shape[1], image_array.shape[0]), interpolation=cv2.INTER_NEAREST)
        
        # 最終檢查：確保 binary_mask 是 2D
        if len(binary_mask.shape) != 2:
            raise HTTPException(status_code=400, detail=f"調整大小後 binary_mask 應該是 2D 數組，但得到形狀: {binary_mask.shape}")
        
        # SAM 要求將圖像 resize 到標準尺寸（最長邊 1024，保持寬高比）
        # 同時將 mask 也 resize 到相同大小
        original_height, original_width = image_array.shape[:2]
        
        # 計算 resize 尺寸（最長邊為 1024）
        max_size = 1024
        scale = max_size / max(original_height, original_width)
        new_height = int(original_height * scale)
        new_width = int(original_width * scale)
        
        # Resize 圖像
        resized_image = cv2.resize(image_array, (new_width, new_height), interpolation=cv2.INTER_LINEAR)
        print(f"調試: 原始圖像尺寸: ({original_height}, {original_width}), Resize 後: ({new_height}, {new_width})")
        
        # Resize mask 到相同尺寸（使用最近鄰插值保持二值特性）
        resized_mask = cv2.resize(binary_mask, (new_width, new_height), interpolation=cv2.INTER_NEAREST)
        print(f"調試: Resize 後 mask 尺寸: {resized_mask.shape}")
        
        # 設置 resize 後的圖像到 SAM predictor
        predictor.set_image(resized_image)
        
        # SAM 的 mask_input 需要是低分辨率（256x256），而不是與圖像相同大小
        # SAM 內部會自動將 mask_input 上採樣到圖像尺寸
        # 使用 SAM 的 transform 來確保尺寸匹配
        mask_input_size = 256
        
        # 將 mask resize 到 256x256（低分辨率），使用最近鄰插值保持二值特性
        low_res_mask = cv2.resize(resized_mask, (mask_input_size, mask_input_size), interpolation=cv2.INTER_NEAREST)
        
        # 轉換為 float32，值為 0.0 或 1.0
        mask_input = (low_res_mask > 127).astype(np.float32)
        
        # 確保是2D
        if len(mask_input.shape) != 2:
            print(f"錯誤: mask_input 在轉換後不是2D，形狀: {mask_input.shape}")
            if mask_input.size == mask_input_size * mask_input_size:
                mask_input = mask_input.reshape(mask_input_size, mask_input_size)
            else:
                raise HTTPException(status_code=400, detail=f"mask_input 應該是 2D 數組，但得到形狀: {mask_input.shape}")
        
        # SAM 的 predict() 方法期望 mask_input 是 [1, H, W] 格式（3D）
        # 添加 batch 維度：[H, W] -> [1, H, W]
        mask_input = np.expand_dims(mask_input, axis=0)
        
        # 最終檢查：確保是 3D 數組 [1, H, W]，其中 H=W=256
        if len(mask_input.shape) != 3:
            raise HTTPException(status_code=400, detail=f"mask_input 應該是 3D 數組 [1, H, W]，但得到形狀: {mask_input.shape}")
        
        # 驗證尺寸
        if mask_input.shape[1] != mask_input_size or mask_input.shape[2] != mask_input_size:
            raise HTTPException(status_code=400, detail=f"mask_input 應該是 [1, {mask_input_size}, {mask_input_size}]，但得到: {mask_input.shape}")
        
        # 打印最終形狀用於調試
        print(f"調試: 最終 mask_input 形狀: {mask_input.shape}, 類型: {type(mask_input)}, dtype: {mask_input.dtype}")
        
        # 計算 bounding box（從 resize 後的 mask）
        coords = np.column_stack(np.where(resized_mask > 127))
        if len(coords) == 0:
            raise HTTPException(status_code=400, detail="Invalid mask: no valid region found")
        
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        
        # 轉換為 [x, y, x, y] 格式（左上角和右下角）
        input_box = np.array([x_min, y_min, x_max, y_max])
        
        # 執行預測（使用 multimask_output=True 獲取多個候選 mask，然後選擇最佳）
        masks, scores, logits = predictor.predict(
            point_coords=None,
            point_labels=None,
            box=input_box[np.newaxis, :],
            mask_input=mask_input,
            multimask_output=True  # 改為 True 以獲取多個候選 mask
        )
        
        # 選擇分數最高的 mask（通常 scores[0] 是最佳的）
        best_mask_idx = 0
        if len(scores) > 1:
            # 選擇分數最高的 mask
            best_mask_idx = np.argmax(scores)
        
        best_mask = masks[best_mask_idx]
        best_mask_binary = (best_mask > 0).astype(np.uint8) * 255
        
        print(f"調試: 原始 mask 像素數: {(best_mask_binary > 0).sum()}, 尺寸: {best_mask_binary.shape}")
        
        # 關鍵修復：立即使用用戶原始 mask 約束預測結果，確保嚴格遵守用戶圈選範圍
        # 這可以防止 SAM 預測出超出用戶圈選範圍的區域，避免破碎問題
        best_mask_binary = cv2.bitwise_and(best_mask_binary, resized_mask)
        print(f"調試: 約束後 mask 像素數: {(best_mask_binary > 0).sum()}")
        
        # 形態學處理：填孔 + 平滑 + 去除噪音
        # 在 resize 之前進行處理，效率更高
        
        # 1. CLOSE 操作：先膨脹後腐蝕，用於填補內部小孔洞和連接斷開的區域
        # 使用較大的 kernel 來填補較大的孔洞
        kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        mask_closed = cv2.morphologyEx(best_mask_binary, cv2.MORPH_CLOSE, kernel_close, iterations=3)
        
        # 再次約束，確保形態學處理後仍然遵守用戶圈選範圍
        mask_closed = cv2.bitwise_and(mask_closed, resized_mask)
        
        # 2. OPEN 操作：先腐蝕後膨脹，用於去除小噪點、毛刺和邊緣不平滑
        # 使用較小的 kernel 來精細去除噪點
        kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask_opened = cv2.morphologyEx(mask_closed, cv2.MORPH_OPEN, kernel_open, iterations=1)
        
        # 再次約束，確保 OPEN 操作後仍然遵守用戶圈選範圍
        mask_opened = cv2.bitwise_and(mask_opened, resized_mask)
        
        # 3. 再次 CLOSE 以確保邊緣平滑並填補可能殘留的小孔
        kernel_close_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        mask_final = cv2.morphologyEx(mask_opened, cv2.MORPH_CLOSE, kernel_close_small, iterations=2)
        
        # 再次約束，確保最終結果仍然遵守用戶圈選範圍
        mask_final = cv2.bitwise_and(mask_final, resized_mask)
        
        # 4. 可選：使用中值濾波進一步平滑邊緣（去除小噪點）
        mask_final = cv2.medianBlur(mask_final, 3)
        
        # 再次約束，確保中值濾波後仍然遵守用戶圈選範圍
        mask_final = cv2.bitwise_and(mask_final, resized_mask)
        
        # 5. 確保二值化（中值濾波後可能產生灰度值）
        mask_final = (mask_final > 127).astype(np.uint8) * 255
        
        print(f"調試: 形態學處理完成，處理後 mask 像素數: {(mask_final > 0).sum()}")
        
        # 將 mask resize 回原始圖像尺寸
        best_mask_original_size = cv2.resize(
            mask_final, 
            (original_width, original_height), 
            interpolation=cv2.INTER_NEAREST
        )
        
        # 創建用戶原始 mask 的原始尺寸版本，用於約束
        user_mask_original = cv2.resize(binary_mask, (original_width, original_height), interpolation=cv2.INTER_NEAREST)
        user_mask_original = (user_mask_original > 127).astype(np.uint8) * 255
        
        # 關鍵修復：resize 後立即約束，防止 resize 引入超出範圍的像素
        best_mask_original_size = cv2.bitwise_and(best_mask_original_size, user_mask_original)
        
        # Resize 後進行更強的形態學處理以修復破碎和填補孔洞
        # 1. 使用較大的 CLOSE kernel 來填補 resize 可能引入的孔洞
        kernel_close_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        best_mask_original_size = cv2.morphologyEx(
            best_mask_original_size, 
            cv2.MORPH_CLOSE, 
            kernel_close_large, 
            iterations=3  # 增加迭代次數以更好地填補孔洞
        )
        # 約束：確保遵守用戶原始圈選範圍
        best_mask_original_size = cv2.bitwise_and(best_mask_original_size, user_mask_original)
        
        # 2. 使用 OPEN 去除小噪點，但使用較小的 kernel 避免過度去除
        kernel_open_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        best_mask_original_size = cv2.morphologyEx(
            best_mask_original_size, 
            cv2.MORPH_OPEN, 
            kernel_open_small, 
            iterations=1
        )
        # 約束：確保 OPEN 操作後仍然遵守用戶圈選範圍
        best_mask_original_size = cv2.bitwise_and(best_mask_original_size, user_mask_original)
        
        # 3. 再次 CLOSE 以確保邊緣平滑並填補可能殘留的小孔
        kernel_close_medium = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        best_mask_original_size = cv2.morphologyEx(
            best_mask_original_size, 
            cv2.MORPH_CLOSE, 
            kernel_close_medium, 
            iterations=2
        )
        # 最終約束：確保最終結果嚴格遵守用戶圈選範圍
        best_mask_original_size = cv2.bitwise_and(best_mask_original_size, user_mask_original)
        
        # 4. 使用 GaussianBlur 平滑邊緣，然後二值化
        best_mask_original_size = cv2.GaussianBlur(best_mask_original_size, (5, 5), 1.5)
        best_mask_original_size = (best_mask_original_size > 127).astype(np.uint8) * 255
        
        # 5. 使用中值濾波進一步平滑邊緣，減少鋸齒狀邊緣
        best_mask_original_size = cv2.medianBlur(best_mask_original_size, 5)  # 使用 5x5 而不是 3x3
        
        # 最終約束：確保中值濾波後仍然遵守用戶圈選範圍
        best_mask_original_size = cv2.bitwise_and(best_mask_original_size, user_mask_original)
        
        # 6. 填充內部孔洞（使用 floodFill）
        # 找到所有連通區域，填充內部孔洞
        h, w = best_mask_original_size.shape
        mask_filled = best_mask_original_size.copy()
        
        # 從邊緣開始 floodFill，將邊緣外的區域標記為背景
        # 然後反轉，填充內部孔洞
        mask_inv = cv2.bitwise_not(mask_filled)
        mask_temp = mask_inv.copy()
        
        # 填充邊緣外的區域
        cv2.floodFill(mask_temp, None, (0, 0), 255)
        cv2.floodFill(mask_temp, None, (w-1, 0), 255)
        cv2.floodFill(mask_temp, None, (0, h-1), 255)
        cv2.floodFill(mask_temp, None, (w-1, h-1), 255)
        
        # 反轉得到填充後的 mask（邊緣外的區域被填充，內部孔洞也被填充）
        mask_filled = cv2.bitwise_not(mask_temp)
        
        # 約束：確保填充後仍然遵守用戶圈選範圍
        best_mask_original_size = cv2.bitwise_and(mask_filled, user_mask_original)
        
        # 7. 確保二值化
        best_mask_original_size = (best_mask_original_size > 127).astype(np.uint8) * 255
        
        # 提取 mask 區域的邊界框（基於原始尺寸的 mask）
        coords = np.column_stack(np.where(best_mask_original_size > 0))
        if len(coords) == 0:
            raise HTTPException(status_code=400, detail="No valid segmentation result")
        
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        
        x = int(x_min)
        y = int(y_min)
        w = int(x_max - x_min + 1)
        h = int(y_max - y_min + 1)
        
        # 裁切原圖的 RGB 區域
        rgb_crop = image_array[y_min:y_max+1, x_min:x_max+1].copy()
        
        # 裁切 mask 區域（基於原始尺寸）
        mask_crop = best_mask_original_size[y_min:y_max+1, x_min:x_max+1]
        
        # 創建 alpha 通道：mask 為 True 的地方 alpha=255，False 的地方 alpha=0
        alpha_channel = mask_crop.astype(np.uint8)
        
        # 將 RGB 和 alpha 合併成 RGBA
        rgba_image = np.dstack([rgb_crop, alpha_channel])
        
        # 創建 RGBA 模式的 PIL Image
        pil_rgba = Image.fromarray(rgba_image, mode='RGBA')
        
        # 轉換為 base64
        buffer = BytesIO()
        pil_rgba.save(buffer, format='PNG')
        buffer.seek(0)
        base64_str = base64.b64encode(buffer.read()).decode('utf-8')
        base64_url = f"data:image/png;base64,{base64_str}"
        
        result_masks = [{
            "image": base64_url,
            "offsetX": x,
            "offsetY": y,
            "width": w,
            "height": h
        }]
        
        return {"masks": result_masks}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"處理圖片時發生錯誤: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"處理圖片時發生錯誤: {str(e)}")


def _decode_base64_image_data(image_data: str) -> bytes:
    """接受純 Base64 或 data:image/...;base64, 前綴。"""
    s = (image_data or "").strip()
    if "base64," in s:
        s = s.split("base64,", 1)[1]
    s = s.replace("\n", "").replace("\r", "")
    try:
        return base64.b64decode(s, validate=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"無效的 image_data（Base64）: {e}") from e


def _download_video_from_gcs_uri(gs_uri: str) -> tuple[bytes, str]:
    """從 gs://bucket/object 下載影片位元組（需 Service Account 有該物件讀取權限）。"""
    from google.cloud import storage

    if not gs_uri.startswith("gs://"):
        raise ValueError(f"非 GCS URI: {gs_uri}")
    rest = gs_uri[5:]
    if "/" not in rest:
        raise ValueError(f"無效的 GCS URI: {gs_uri}")
    bucket_name, blob_path = rest.split("/", 1)
    client = storage.Client(project=VERTEX_AI_PROJECT)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    data = blob.download_as_bytes()
    mime = blob.content_type or "video/mp4"
    return data, mime


def _run_veo_video_job(job_id: str, image_bytes: bytes, prompt: str) -> None:
    """於背景執行緒內呼叫 Veo，並更新 _video_jobs。任務開始即納入 try，確保任何例外都寫入 failed。"""
    from google.genai import types

    try:
        with _video_jobs_lock:
            if job_id not in _video_jobs:
                print(
                    f"Veo 背景任務中止：job_id 不在 _video_jobs（可能主進程已重載）: {job_id}"
                )
                return
            _video_jobs[job_id]["status"] = "running"
            _video_jobs[job_id]["message"] = "正在生成影片…"

        if genai_client is None:
            raise RuntimeError("GenAI Client 未初始化，請檢查 vertex-key.json 與 Vertex AI 設定")

        _install_veo_generate_videos_safety_patch()

        gcs_out = VEO_OUTPUT_GCS_URI
        config_kwargs = {
            "duration_seconds": int(os.environ.get("VEO_DURATION_SECONDS", "5")),
            "aspect_ratio": os.environ.get("VEO_ASPECT_RATIO", "16:9"),
            "number_of_videos": 1,
            "person_generation": VEO_PERSON_GENERATION or "allow_adult",
        }
        if gcs_out:
            config_kwargs["output_gcs_uri"] = gcs_out

        safety_list = _veo_safety_settings_as_genai_types()
        veo_debug_json = _veo_debug_predict_request_json(
            model_id=VEO_MODEL_ID,
            prompt=prompt,
            image_bytes=image_bytes,
            image_mime="image/png",
            config_kwargs=config_kwargs,
            safety_settings=safety_list,
            person_generation=config_kwargs["person_generation"],
        )

        _veo_tls.safety_settings = safety_list
        try:
            try:
                operation = genai_client.models.generate_videos(
                    model=VEO_MODEL_ID,
                    source=types.GenerateVideosSource(
                        prompt=prompt,
                        image=types.Image(
                            image_bytes=image_bytes, mime_type="image/png"
                        ),
                    ),
                    config=types.GenerateVideosConfig(**config_kwargs),
                )
            except Exception as exc:
                _veo_print_request_debug(
                    f"generate_videos 例外 job={job_id}", veo_debug_json
                )
                try:
                    from google.genai.errors import APIError

                    if isinstance(exc, APIError):
                        print(f"Veo APIError.details: {exc.details!r}")
                        resp = getattr(exc, "response", None)
                        if resp is not None and hasattr(resp, "text"):
                            print(f"Veo APIError HTTP body:\n{resp.text}")
                except ImportError:
                    pass
                raise
        finally:
            if hasattr(_veo_tls, "safety_settings"):
                delattr(_veo_tls, "safety_settings")

        with _video_jobs_lock:
            _video_jobs[job_id]["gcp_operation_name"] = operation.name

        while operation.done is not True:
            time.sleep(_VEO_POLL_INTERVAL_SEC)
            operation = genai_client.operations.get(operation)
            with _video_jobs_lock:
                _video_jobs[job_id]["message"] = "影片生成進行中，請稍候…"

        if operation.error:
            _veo_print_request_debug(
                f"長運算完成但回傳錯誤 job={job_id}", veo_debug_json
            )
            err = operation.error
            raise RuntimeError(str(err))

        result = operation.response or operation.result
        if not result or not result.generated_videos:
            raise RuntimeError("完成後未取得影片結果")

        gv0 = result.generated_videos[0]
        video = gv0.video if gv0 else None
        if not video:
            raise RuntimeError("回應中無 video 物件")

        raw: bytes
        mime = video.mime_type or "video/mp4"
        if video.video_bytes:
            raw = video.video_bytes
        elif video.uri and video.uri.startswith("gs://"):
            with _video_jobs_lock:
                _video_jobs[job_id]["message"] = "正在從雲端儲存取得影片…"
            raw, mime = _download_video_from_gcs_uri(video.uri)
        else:
            raise RuntimeError(f"未取得影片位元組或 GCS URI: uri={video.uri!r}")

        with _video_jobs_lock:
            _video_jobs[job_id]["status"] = "completed"
            _video_jobs[job_id]["message"] = "完成"
            _video_jobs[job_id]["video_bytes"] = raw
            _video_jobs[job_id]["video_mime_type"] = mime
            # 大檔不塞 Base64，改以 /video-result/{job_id} 播放
            max_b64 = int(os.environ.get("VEO_MAX_BASE64_BYTES", str(2 * 1024 * 1024)))
            if len(raw) <= max_b64:
                _video_jobs[job_id]["video_base64"] = base64.b64encode(raw).decode("ascii")
            else:
                _video_jobs[job_id]["video_base64"] = None
            _video_jobs[job_id]["video_url"] = f"/video-result/{job_id}"

    except Exception as e:
        print(f"Veo 任務 {job_id} 失敗: {e}")
        import traceback

        traceback.print_exc()
        with _video_jobs_lock:
            if job_id in _video_jobs:
                _video_jobs[job_id]["status"] = "failed"
                _video_jobs[job_id]["message"] = str(e)
                _video_jobs[job_id]["error"] = str(e)


class GenerateVideoBody(BaseModel):
    image_data: str = Field(..., description="透明背景物件圖，Base64 或 data:image/png;base64,...")
    prompt: str = Field(..., description="動作／影片描述")


@app.post("/generate-video")
async def generate_video(body: GenerateVideoBody):
    """
    建立 Veo Image-to-Video 背景任務，立即回傳 job_id。
    請以 GET /video-status/{job_id} 輪詢；完成後可用 video_url 或 video_base64。
    """
    if genai_client is None:
        raise HTTPException(
            status_code=503,
            detail="Veo 未就緒：請確認 vertex-key.json、Vertex AI API 與專案權限",
        )
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt 不可為空")

    image_bytes = _decode_base64_image_data(body.image_data)
    if len(image_bytes) < 32:
        raise HTTPException(status_code=400, detail="圖片資料過短或損毀")

    job_id = str(uuid.uuid4())
    with _video_jobs_lock:
        _video_jobs[job_id] = {
            "status": "pending",
            "message": "已排入佇列",
            "prompt": prompt[:500],
            "error": None,
            "video_bytes": None,
            "video_mime_type": None,
            "video_base64": None,
            "video_url": None,
            "gcp_operation_name": None,
        }

    thread = threading.Thread(
        target=_run_veo_video_job,
        args=(job_id, image_bytes, prompt),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "status": "pending"}


@app.get("/video-status/{job_id}")
async def video_status(job_id: str):
    """
    查詢影片生成狀態；完成時含 video_url，可能含 video_base64（較小檔案時）。
    若查無任務仍回傳 200 + status=failed（避免輪詢收到 404）；常見原因：uvicorn --reload
    重載清空記憶體、或多 Worker 導致 POST/GET 打到不同進程。
    """
    with _video_jobs_lock:
        job = _video_jobs.get(job_id)
    if not job:
        return {
            "job_id": job_id,
            "status": "failed",
            "message": "找不到此任務。可能原因：伺服器已重載（--reload）、使用多個 Worker、或 job_id 錯誤。請重新提交生成。",
            "error": "JOB_NOT_FOUND",
        }

    out = {
        "job_id": job_id,
        "status": job["status"],
        "message": job.get("message"),
    }
    if job["status"] == "failed":
        out["error"] = job.get("error") or job.get("message")
    if job["status"] == "completed":
        out["video_mime_type"] = job.get("video_mime_type") or "video/mp4"
        out["video_url"] = job.get("video_url")
        if job.get("video_base64"):
            out["video_base64"] = job["video_base64"]
    return out


@app.get("/video-result/{job_id}")
async def video_result(job_id: str):
    """任務完成後，以 MP4（或其它 mime）串流回傳，供 <video src> 使用。"""
    with _video_jobs_lock:
        job = _video_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="找不到此 job_id")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"任務尚未完成，狀態: {job['status']}")
    raw = job.get("video_bytes")
    if not raw:
        raise HTTPException(status_code=500, detail="內部錯誤：遺失影片資料")
    mime = job.get("video_mime_type") or "video/mp4"
    return Response(content=raw, media_type=mime)


@app.get("/")
async def root():
    return {
        "message": "SAM Image Segmentation API",
        "status": "running",
        "model_loaded": mask_generator is not None,
        "endpoints": {
            "docs": "/docs",
            "redoc": "/redoc",
            "segment_image": "/segment-image (POST)",
            "segment_with_mask": "/segment-with-mask (POST)",
            "generate_video": "/generate-video (POST)",
            "video_status": "/video-status/{job_id} (GET)",
            "video_result": "/video-result/{job_id} (GET)"
        }
    }
