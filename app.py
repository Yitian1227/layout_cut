from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator, SamPredictor
import torch
from PIL import Image
import numpy as np
import base64
from io import BytesIO
import os
import cv2

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
            device = torch.device('cpu')
            sam = sam_model_registry["vit_b"](checkpoint=model_path)
            sam.to(device=device)
            mask_generator = SamAutomaticMaskGenerator(sam)
            predictor = SamPredictor(sam)
            print("SAM 模型載入成功")
    except Exception as e:
        print(f"載入模型時發生錯誤: {e}")
        print("服務將啟動，但無法進行圖片分割")
    
    yield
    
    # 清理資源（如果需要）
    print("應用關閉")

app = FastAPI(lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
            gray = cv2.cvtColor(mask_image, cv2.COLOR_RGB2GRAY)
            binary_mask = gray
        else:
            # 其他情況，取第一個通道
            binary_mask = mask_image[:, :, 0]
    else:
        # 如果維度不對，嘗試重塑
        print(f"警告: mask_image 形狀異常: {mask_image.shape}")
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
        if len(binary_mask.shape) != 2:
            raise HTTPException(status_code=400, detail=f"binary_mask 應該是 2D 數組，但得到形狀: {binary_mask.shape}")
        
        # 確保 mask 與圖像尺寸一致
        if binary_mask.shape[:2] != image_array.shape[:2]:
            binary_mask = cv2.resize(binary_mask, (image_array.shape[1], image_array.shape[0]), interpolation=cv2.INTER_NEAREST)
        
        # 最終檢查：確保 binary_mask 是 2D
        if len(binary_mask.shape) != 2:
            raise HTTPException(status_code=400, detail=f"調整大小後 binary_mask 應該是 2D 數組，但得到形狀: {binary_mask.shape}")
        
        # 設置圖像到 SAM predictor
        predictor.set_image(image_array)
        
        # 使用 mask 進行預測
        # mask_input 應該是 [1, 1, H, W] 的格式，值為 0.0 或 1.0
        # 確保 binary_mask 是 2D (H, W)
        mask_input = (binary_mask > 127).astype(np.float32)
        
        # 檢查形狀
        if len(mask_input.shape) != 2:
            raise HTTPException(status_code=400, detail=f"mask_input 應該是 2D 數組，但得到形狀: {mask_input.shape}")
        
        # 添加 batch 和 channel 維度：[H, W] -> [1, 1, H, W]
        mask_input = mask_input[np.newaxis, np.newaxis, :, :]
        
        # 最終檢查：確保是 4D 數組
        if len(mask_input.shape) != 4:
            raise HTTPException(status_code=400, detail=f"mask_input 應該是 4D 數組 [1, 1, H, W]，但得到形狀: {mask_input.shape}")
        
        # 計算 bounding box（從 mask）
        coords = np.column_stack(np.where(binary_mask > 127))
        if len(coords) == 0:
            raise HTTPException(status_code=400, detail="Invalid mask: no valid region found")
        
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        
        # 轉換為 [x, y, x, y] 格式（左上角和右下角）
        input_box = np.array([x_min, y_min, x_max, y_max])
        
        # 執行預測
        masks, scores, logits = predictor.predict(
            point_coords=None,
            point_labels=None,
            box=input_box[np.newaxis, :],
            mask_input=mask_input,
            multimask_output=False
        )
        
        # 使用最佳 mask
        best_mask = masks[0]
        best_mask_binary = (best_mask > 0).astype(np.uint8) * 255
        
        # 提取 mask 區域的邊界框
        coords = np.column_stack(np.where(best_mask_binary > 0))
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
        
        # 裁切 mask 區域
        mask_crop = best_mask_binary[y_min:y_max+1, x_min:x_max+1]
        
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
            "segment_with_mask": "/segment-with-mask (POST)"
        }
    }
