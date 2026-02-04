from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator
import torch
from PIL import Image
import numpy as np
import base64
from io import BytesIO
import os

# 全局變數存儲模型
sam = None
mask_generator = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """在應用啟動時載入 SAM 模型"""
    global sam, mask_generator
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

@app.get("/")
async def root():
    return {
        "message": "SAM Image Segmentation API",
        "status": "running",
        "model_loaded": mask_generator is not None,
        "endpoints": {
            "docs": "/docs",
            "redoc": "/redoc",
            "segment_image": "/segment-image (POST)"
        }
    }
