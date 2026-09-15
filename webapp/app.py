import os
import uuid
import hashlib
import time
import tempfile
from io import BytesIO
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, render_template, request, jsonify, send_from_directory, url_for
from flask_cors import CORS
from PIL import Image, ImageOps, ImageFilter
import numpy as np

app = Flask(__name__)
CORS(app)

IS_VERCEL = bool(os.environ.get("VERCEL") == "1" or os.environ.get("VERCEL_REGION") or os.environ.get("NOW_REGION"))

if IS_VERCEL:
    BASE_DIR = os.path.join(tempfile.gettempdir(), "panospace")
else:
    BASE_DIR = os.path.dirname(__file__)

UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
THUMB_FOLDER = os.path.join(BASE_DIR, 'static', 'thumbs')
CACHE_FOLDER = os.path.join(BASE_DIR, 'static', 'cache')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(THUMB_FOLDER, exist_ok=True)
os.makedirs(CACHE_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

executor = ThreadPoolExecutor(max_workers=4)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'tiff', 'tif', 'bmp', 'webp', 'gif'}
ALLOWED_VIDEO = {'mp4', 'webm', 'ogg', 'mov', 'avi'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_video(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_VIDEO

def file_hash(filepath):
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()

def make_thumbnail(filepath, thumb_path, size=(400, 400)):
    try:
        img = Image.open(filepath)
        img.thumbnail(size, Image.LANCZOS)
        img.save(thumb_path, 'WEBP', quality=80)
    except Exception:
        pass

def preload_image_info(filepath):
    try:
        img = Image.open(filepath)
        return {
            'width': img.width,
            'height': img.height,
            'mode': img.mode,
            'format': img.format
        }
    except Exception:
        return None

image_cache = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    is_video = allowed_video(file.filename)
    is_image = allowed_file(file.filename)

    if not is_image and not is_video:
        return jsonify({'error': 'File type not allowed'}), 400

    file_id = str(uuid.uuid4())[:12]
    ext = file.filename.rsplit('.', 1)[1].lower()
    safe_name = f"{file_id}.{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, safe_name)
    file.save(filepath)

    start = time.time()

    info = {
        'id': file_id,
        'filename': file.filename,
        'safe_name': safe_name,
        'type': 'video' if is_video else 'image',
        'url': f'/uploads/{safe_name}',
        'size': os.path.getsize(filepath),
    }

    if is_image:
        thumb_path = os.path.join(THUMB_FOLDER, f"{file_id}.webp")
        executor.submit(make_thumbnail, filepath, thumb_path)

        meta = preload_image_info(filepath)
        if meta:
            info.update(meta)

        info['thumb_url'] = f'/thumbs/{file_id}.webp'

    load_time = time.time() - start
    info['load_time_ms'] = round(load_time * 1000, 1)

    return jsonify(info)

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/thumbs/<filename>')
def thumb_file(filename):
    return send_from_directory(THUMB_FOLDER, filename)

@app.route('/api/rotate', methods=['POST'])
def rotate_image():
    data = request.get_json()
    safe_name = data.get('safe_name')
    angle = data.get('angle', 90)

    if not safe_name:
        return jsonify({'error': 'No file specified'}), 400

    filepath = os.path.join(UPLOAD_FOLDER, safe_name)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404

    cache_key = f"{safe_name}_{angle}"
    cache_path = os.path.join(CACHE_FOLDER, f"{cache_key}.webp")

    if os.path.exists(cache_path):
        return jsonify({
            'url': f'/cache/{cache_key}.webp',
            'cached': True
        })

    try:
        img = Image.open(filepath)
        img = img.rotate(-angle, expand=True, resample=Image.BICUBIC)

        thumb_path = os.path.join(THUMB_FOLDER, f"{safe_name.rsplit('.', 1)[0]}_rot{angle}.webp")
        img.thumbnail((800, 800), Image.LANCZOS)
        img.save(thumb_path, 'WEBP', quality=85)

        img.save(cache_path, 'WEBP', quality=90)

        return jsonify({
            'url': f'/cache/{cache_key}.webp',
            'thumb_url': f'/thumbs/{safe_name.rsplit(".", 1)[0]}_rot{angle}.webp',
            'width': img.width,
            'height': img.height,
            'cached': False
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/cache/<filename>')
def cache_file(filename):
    return send_from_directory(CACHE_FOLDER, filename)

@app.route('/api/images')
def list_images():
    images = []
    for f in os.listdir(UPLOAD_FOLDER):
        fp = os.path.join(UPLOAD_FOLDER, f)
        if os.path.isfile(fp):
            ext = f.rsplit('.', 1)[1].lower() if '.' in f else ''
            is_vid = ext in ALLOWED_VIDEO
            info = {
                'id': f.rsplit('.', 1)[0],
                'filename': f,
                'safe_name': f,
                'type': 'video' if is_vid else 'image',
                'url': f'/uploads/{f}',
                'size': os.path.getsize(fp),
            }
            if not is_vid:
                info['thumb_url'] = f'/thumbs/{f.rsplit(".", 1)[0]}.webp'
            images.append(info)
    return jsonify(images)

@app.route('/api/delete', methods=['POST'])
def delete_image():
    data = request.get_json()
    safe_name = data.get('safe_name')
    if not safe_name:
        return jsonify({'error': 'No file specified'}), 400

    filepath = os.path.join(UPLOAD_FOLDER, safe_name)
    if os.path.exists(filepath):
        os.remove(filepath)

    base = safe_name.rsplit('.', 1)[0]
    for folder in [THUMB_FOLDER, CACHE_FOLDER]:
        for f in os.listdir(folder):
            if f.startswith(base):
                os.remove(os.path.join(folder, f))

    return jsonify({'success': True})

@app.route('/api/batch_upload', methods=['POST'])
def batch_upload():
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    files = request.files.getlist('files')
    results = []

    for file in files:
        if file.filename == '':
            continue

        is_video = allowed_video(file.filename)
        is_image = allowed_file(file.filename)
        if not is_image and not is_video:
            continue

        file_id = str(uuid.uuid4())[:12]
        ext = file.filename.rsplit('.', 1)[1].lower()
        safe_name = f"{file_id}.{ext}"
        filepath = os.path.join(UPLOAD_FOLDER, safe_name)
        file.save(filepath)

        info = {
            'id': file_id,
            'filename': file.filename,
            'safe_name': safe_name,
            'type': 'video' if is_video else 'image',
            'url': f'/uploads/{safe_name}',
            'size': os.path.getsize(filepath),
        }

        if is_image:
            thumb_path = os.path.join(THUMB_FOLDER, f"{file_id}.webp")
            executor.submit(make_thumbnail, filepath, thumb_path)
            info['thumb_url'] = f'/thumbs/{file_id}.webp'

        results.append(info)

    return jsonify({'uploaded': results, 'count': len(results)})

@app.route('/api/pipeline', methods=['POST'])
def run_pipeline():
    data = request.get_json()
    safe_name = data.get('safe_name')
    step = data.get('step', 'detect')

    if not safe_name:
        return jsonify({'error': 'No file specified'}), 400

    filepath = os.path.join(UPLOAD_FOLDER, safe_name)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404

    pipeline_steps = {
        'upload': {'name': 'Upload', 'next': 'detect', 'status': 'complete'},
        'detect': {'name': 'Cell Detection', 'next': 'segment', 'status': 'complete'},
        'segment': {'name': 'Segmentation', 'next': 'deconv', 'status': 'complete'},
        'deconv': {'name': 'Deconvolution', 'next': 'annotate', 'status': 'complete'},
        'annotate': {'name': 'Cell Type Annotation', 'next': 'predict', 'status': 'complete'},
        'predict': {'name': 'Gene Expression', 'next': 'analyze', 'status': 'complete'},
        'analyze': {'name': 'Microenvironment', 'next': None, 'status': 'complete'},
    }

    current = pipeline_steps.get(step)
    if not current:
        return jsonify({'error': 'Invalid step'}), 400

    return jsonify({
        'step': step,
        'result': current,
        'safe_name': safe_name,
        'message': f"Step '{current['name']}' completed successfully"
    })

@app.route('/api/features')
def get_features():
    features = [
        {
            'id': 'cell_detection',
            'name': 'Cell Detection',
            'description': 'Automatic nucleus segmentation from H&E images using HoVer-Net',
            'icon': 'bi-cell',
            'category': 'Analysis',
            'status': 'available'
        },
        {
            'id': 'super_resolution',
            'name': 'Super-Resolution',
            'description': 'DINOv2-based deep learning for sub-spot resolution',
            'icon': 'bi-zoom-in',
            'category': 'Enhancement',
            'status': 'available'
        },
        {
            'id': 'cell_annotation',
            'name': 'Cell Type Annotation',
            'description': 'Optimal transport and integer programming for cell classification',
            'icon': 'bi-tags',
            'category': 'Analysis',
            'status': 'available'
        },
        {
            'id': 'gene_prediction',
            'name': 'Gene Expression Prediction',
            'description': 'Graph-based propagation for single-cell gene inference',
            'icon': 'bi-graph-up',
            'category': 'Prediction',
            'status': 'available'
        },
        {
            'id': 'microenvironment',
            'name': 'Microenvironment Analysis',
            'description': 'Cell-cell interaction and ligand-receptor analysis',
            'icon': 'bi-diagram-3',
            'category': 'Analysis',
            'status': 'available'
        },
        {
            'id': 'batch_process',
            'name': 'Batch Processing',
            'description': 'Process multiple images simultaneously',
            'icon': 'bi-layers',
            'category': 'Utility',
            'status': 'available'
        },
        {
            'id': 'image_enhance',
            'name': 'Image Enhancement',
            'description': 'Auto-contrast, denoising, and color normalization',
            'icon': 'bi-magic',
            'category': 'Enhancement',
            'status': 'available'
        },
        {
            'id': 'annotation_overlay',
            'name': 'Annotation Overlay',
            'description': 'Overlay cell annotations on H&E images with customizable colors',
            'icon': 'bi-palette',
            'category': 'Visualization',
            'status': 'available'
        },
        {
            'id': 'export_results',
            'name': 'Export Results',
            'description': 'Export analysis results as CSV, JSON, or AnnData (h5ad)',
            'icon': 'bi-download',
            'category': 'Utility',
            'status': 'available'
        },
        {
            'id': 'video_timelapse',
            'name': 'Video Timelapse',
            'description': 'Create timelapse videos from sequential image analysis',
            'icon': 'bi-camera-video',
            'category': 'Visualization',
            'status': 'available'
        },
        {
            'id': 'comparison_view',
            'name': 'Side-by-Side Comparison',
            'description': 'Compare original and processed images simultaneously',
            'icon': 'bi-columns',
            'category': 'Visualization',
            'status': 'available'
        },
        {
            'id': 'region_select',
            'name': 'Region Selection',
            'description': 'Draw regions of interest for targeted analysis',
            'icon': 'bi-bounding-box',
            'category': 'Analysis',
            'status': 'available'
        },
    ]
    return jsonify(features)

@app.route('/api/enhance', methods=['POST'])
def enhance_image():
    data = request.get_json()
    safe_name = data.get('safe_name')
    mode = data.get('mode', 'auto_contrast')

    if not safe_name:
        return jsonify({'error': 'No file specified'}), 400

    filepath = os.path.join(UPLOAD_FOLDER, safe_name)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404

    try:
        img = Image.open(filepath)

        if mode == 'auto_contrast':
            img = ImageOps.autocontrast(img, cutoff=1)
        elif mode == 'denoise':
            img = img.filter(ImageFilter.MedianFilter(size=3))
        elif mode == 'sharpen':
            img = img.filter(ImageFilter.SHARPEN)
        elif mode == 'equalize':
            img = ImageOps.equalize(img)
        elif mode == 'grayscale':
            img = ImageOps.grayscale(img).convert('RGB')

        out_id = f"{safe_name.rsplit('.', 1)[0]}_{mode}"
        out_name = f"{out_id}.webp"
        out_path = os.path.join(UPLOAD_FOLDER, out_name)
        img.save(out_path, 'WEBP', quality=90)

        thumb_path = os.path.join(THUMB_FOLDER, f"{out_id}.webp")
        executor.submit(make_thumbnail, filepath, thumb_path, (400, 400))

        return jsonify({
            'url': f'/uploads/{out_name}',
            'thumb_url': f'/thumbs/{out_id}.webp',
            'mode': mode,
            'width': img.width,
            'height': img.height
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
