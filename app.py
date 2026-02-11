from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator, SamPredictor
from segment_anything.utils.transforms import ResizeLongestSide
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
