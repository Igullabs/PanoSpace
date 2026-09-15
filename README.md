# PanoSpace

**High-resolution single-cell insight from low-resolution spatial transcriptomics**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-orange.svg)](https://github.com/hehuifeng/PanoSpace)

---

## Overview

PanoSpace is a Python package designed for single-cell level analysis and visualization of low-resolution spatial transcriptomics data (e.g., 10x Visium). By integrating scRNA-seq data, low-resolution spatial transcriptomics data, and high-definition H&E-stained images, PanoSpace transforms spot-level spatial transcriptomics data into detailed, whole-tissue single-cell insights.

![PanoSpace Overview](figures/fig1.png)

## Key Features

- **Cell Detection**: Accurate nucleus segmentation from H&E images using HoVer-Net/CellViT
- **Super-Resolution Deconvolution**: DINOv2-based deep learning model to predict cell type proportions at sub-spot resolution
- **Cell Type Annotation**: Optimal transport and integer programming for precise cell type assignment
- **Gene Expression Prediction**: Graph-based propagation for single-cell gene expression inference
- **Microenvironment Analysis**: Cell-cell interaction and ligand-receptor analysis

## Publication

> **He, H.F., Peng, P., Yang, S.T. et al.**  
> *Unlocking single-cell level and continuous whole-slide insights in spatial transcriptomics with PanoSpace.*  
> **Nature Computational Science (2026)**  
> DOI: [https://doi.org/10.1038/s43588-025-00938-y](https://doi.org/10.1038/s43588-025-00938-y)

## Important Notice

> **For the actively developed and redesigned version with a fully integrated pipeline, see:**  
> 👉 **[PanoSpace-core](https://github.com/hehuifeng/PanoSpace-core)**

---

## Table of Contents

- [Web Application](#web-application)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Modules](#modules)
  - [Cell Detector](#cell-detector)
  - [HoVer-Net Trainer](#hover-net-trainer)
  - [Super-Resolution Deconvolution](#super-resolution-deconvolution)
  - [Cell Type Annotator](#cell-type-annotator)
  - [Gene Expression Predictor](#gene-expression-predictor)
  - [Microenvironment Analyzer](#microenvironment-analyzer)
- [Demo Notebooks](#demo-notebooks)
- [API Reference](#api-reference)
- [Dependencies](#dependencies)
- [Citation](#citation)
- [License](#license)
- [Contact](#contact)

---

## Web Application

PanoSpace includes a **client-side Local Panorama Viewer** — a fast, 100% in-browser 360°/180° panorama explorer. No data ever leaves your device.

**Live demo:** <https://pano-space.vercel.app>

### Features

| Feature | Description |
|---------|-------------|
| **360° / 180° Projection** | Auto-detect or manually switch projection per panorama |
| **Drag to Look** | Pointer / mouse drag rotates the view in any direction |
| **Scroll to Zoom** | Smooth field-of-view zoom (20°–90°) |
| **Video Panoramas** | Play/pause MP4, WebM, MOV; seek bar with timestamps |
| **Client-Side Downscaling** | Large images are downscaled locally via `createImageBitmap` + `OffscreenCanvas` for instant loading |
| **Media Library** | Drawer inventory of all added panoramas with thumbnails, sizes and counts |
| **Drag & Drop Upload** | Drop files anywhere, or use the file picker |
| **Truly Local** | Files stay on your device — nothing is uploaded to a server |
| **Dark UI** | Pixel-perfect match of the PanoSpace "Local Viewer" design |

### Launch Web App

Open <https://pano-space.vercel.app> — or run locally:

```bash
cd webapp
python -m http.server 8080
# Open http://localhost:8080
```

No build step, no dependencies to install; `index.html` loads Three.js from CDN.

### Supported Formats

`JPG · PNG · WEBP · GIF · MP4 · WEBM · MOV`

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` `→` | Pan left / right |
| `↑` `↓` | Pan up / down |
| `+` / `-` | Zoom in / out |
| `Space` | Play / pause video |

---

## Installation

### Prerequisites

- Python >= 3.11
- Ubuntu 22.04.4 LTS (recommended)
- CUDA 12.2 compatible GPU (for training/inference)
- Conda package manager

### Step 1: Create Conda Environment

```bash
conda env create -f environment.yml
conda activate PanoSpace
pip install torch==2.4.0 torchvision==0.19.0 pytorch-lightning==2.1.2
```

> **Note:** The `gurobipy` dependency is commercial software. Students and staff at academic institutions can obtain a free license at [https://pypi.org/project/gurobipy/](https://pypi.org/project/gurobipy/).

### Step 2: Clone and Install PanoSpace

```bash
git clone https://github.com/hehuifeng/PanoSpace.git
cd PanoSpace
pip install .
```

### Step 3: Verify Installation

```python
import panospace as ps
print(ps.__version__)
# Output: '0.1.0'
```

---

## Quick Start

```python
import panospace as ps

# 1. Cell Detection
detector = ps.celldetector(
    img_dir='path/to/h&e_image.png',
    tissue_name='TissueName',
    small_image_size=(5000, 5000)
)
detector.split_img()
detector.run_infer()
detector.merge_img()
detector.make_nuclei_adata()

# 2. Super-Resolution Deconvolution
sr_model = ps.DINOv2_superres_deconv(
    deconv_adata=deconv_adata,
    segment_adata=segment_adata,
    img_dir='path/to/h&e_image.png',
    Experimental_path='path/to/output'
)
sr_model.run_train()
sr_model.run_superres()

# 3. Cell Type Annotation
annotator = ps.CellTypeAnnotator(
    experimental_path='path/to/output',
    img_dir='path/to/h&e_image.png',
    num_classes=9,
    deconv_adata=deconv_adata,
    sr_deconv_adata=sr_adata,
    segment_adata=segment_adata
)
annotator.filter_segmentation()
annotated_cells = annotator.infer_cell_types()

# 4. Gene Expression Prediction
predictor = ps.GeneExpPredictor(
    sc_adata=sc_adata,
    spot_adata=spot_adata,
    infered_adata=annotated_cells
)
gene_expression = predictor.do_geneinfer(gamma=0.1)

# 5. Microenvironment Analysis
analyzer = ps.microenvironment_analyzer(
    genemap=gene_expression,
    Experimental_path='path/to/output'
)
analyzer.detect_microenvironment(search_radius=94)
analyzer.detect_env_gene(sender='CAFs', receiver='Cancer Epithelial')
```

---

## Modules

### Cell Detector

The `celldetector` module performs nucleus segmentation from H&E-stained images using HoVer-Net.

```python
from panospace.cell_detector import celldetector

detector = celldetector(
    img_dir='path/to/image.png',          # Path to H&E image
    tissue_name='TissueName',              # Name identifier for the tissue
    small_image_size=(5000, 5000),          # Size of image tiles for processing
    hover_net_dir='hover_net',              # Path to HoVer-Net repository
    resize=None                             # Optional resize factor
)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `split_img(cvt=True, hue=None)` | Splits large H&E image into tiles for inference |
| `run_infer(weight_dir=None)` | Runs HoVer-Net inference on tiled images |
| `merge_img()` | Merges prediction results and creates overlay |
| `make_nuclei_adata()` | Creates AnnData object with nuclei positions and types |

**Output Classes:**

| ID | Cell Type |
|----|-----------|
| 0 | No label |
| 1 | Neoplastic cells |
| 2 | Inflammatory |
| 3 | Connective/Soft tissue cells |
| 4 | Dead Cells |
| 5 | Epithelial |

---

### HoVer-Net Trainer

The `train_hovernet` module handles HoVer-Net model training on PanNuke dataset.

```python
from panospace.train_hovernet import train_hovernet

trainer = train_hovernet(
    pannuke_dir='PanNuke',      # Path to PanNuke dataset
    focus='all'                  # Tissue focus: 'all' or specific type
)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `download_pannuke()` | Downloads PanNuke dataset folds |
| `split_pannuke()` | Splits data into training/validation sets |
| `prepare_input()` | Prepares input format for HoVer-Net |
| `control_opt()` | Configures optimizer settings |
| `control_config()` | Updates HoVer-Net configuration |
| `run_train()` | Executes training process |

**Supported Tissue Types:**

```
Adrenal gland, Bile-duct, Bladder, Breast, Cervix, Colon,
Esophagus, HeadNeck, Kidney, Liver, Lung, Ovarian, Pancreatic,
Prostate, Skin, Stomach, Testis, Thyroid, Uterus
```

---

### Super-Resolution Deconvolution

The `DINOv2_superres_deconv` module uses DINOv2 vision transformer for sub-spot resolution cell type prediction.

```python
from panospace.superres_deconv import DINOv2_superres_deconv

sr_model = DINOv2_superres_deconv(
    deconv_adata=deconv_adata,       # AnnData with spot-level deconvolution
    segment_adata=segment_adata,     # AnnData with segmentation data
    img_dir='path/to/image.png',     # Path to H&E image
    Experimental_path='path/output', # Output directory
    radius=129,                       # Patch radius for DINOv2
    neighb=3,                         # Number of neighboring patches
    num_classes=9                     # Number of cell type classes
)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `make_sr_datalist()` | Creates super-resolution data grid |
| `run_train(epoch=50, batch_size=256)` | Trains the DINOv2 classifier |
| `run_superres()` | Predicts cell types at sub-spot resolution |

**Architecture:**

- **Backbone**: DINOv2-Base (768-dim features)
- **Input**: Center patch (518×518) + Neighbor context patch
- **Classifier**: 1536 → 512 → num_classes
- **Loss**: KL Divergence with class weighting

---

### Cell Type Annotator

The `CellTypeAnnotator` module assigns cell types to individual nuclei using optimal transport and integer programming.

```python
from panospace.celltype_annotator import CellTypeAnnotator

annotator = CellTypeAnnotator(
    experimental_path='path/to/output',
    img_dir='path/to/image.png',
    num_classes=9,
    deconv_adata=deconv_adata,           # Spot-level deconvolution results
    sr_deconv_adata=sr_adata,            # Super-resolution deconvolution
    segment_adata=segment_adata,         # Nuclei segmentation data
    priori_type_affinities=None,         # Optional prior type affinities
    alpha=0.3                            # Regularization parameter
)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `filter_segmentation()` | Filters segmentation based on spatial proximity |
| `calculate_cell_count()` | Counts cells per spot |
| `calculate_imgtype_ratio()` | Computes image-based type ratios |
| `calculate_celltype_ratio()` | Computes transcriptomic type ratios |
| `calculate_type_transfer_matrix(factor=2)` | Computes OT-based type transfer |
| `infer_cell_types()` | Performs cell type annotation via integer programming |

**Algorithm:**

1. Spatial filtering of nuclei within spot radius
2. Cell count calculation per spot
3. Image-type ratio from morphological features
4. Cell-type ratio from deconvolution
5. Optimal transport for type mapping
6. Binary integer programming for final assignment

---

### Gene Expression Predictor

The `GeneExpPredictor` module predicts single-cell gene expression using graph-based label propagation.

```python
from panospace.genexpression_predictor import GeneExpPredictor

predictor = GeneExpPredictor(
    sc_adata=sc_adata,           # Single-cell RNA-seq reference
    spot_adata=spot_adata,       # Spatial transcriptomics data
    infered_adata=annotated      # Annotated cell data
)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `Find_common_gene(adata1, adata2)` | Identifies common genes between datasets |
| `ctspecific_spot_gene_exp(celltype_list)` | Computes cell-type specific expression |
| `construct_graph(coords, graph_mode, weight_mode, k, sigma)` | Builds spatial graph |
| `do_geneinfer(gamma, graph_mode, ...)` | Performs gene expression prediction |

**Graph Construction:**

| Mode | Description |
|------|-------------|
| `delaunay` | Delaunay triangulation graph |
| `knn` | K-nearest neighbor graph |

**Weight Modes:**

| Mode | Formula |
|------|---------|
| `inverse` | w = 1 / (d + ε) |
| `gaussian` | w = exp(-d² / 2σ²) |

---

### Microenvironment Analyzer

The `microenvironment_analyzer` module analyzes cell-cell interactions and microenvironment effects.

```python
from panospace.microenvironment_analyzer import microenvironment_analyzer

analyzer = microenvironment_analyzer(
    genemap=gene_expression,      # Predicted gene expression AnnData
    Experimental_path='path/to/output'
)
```

**Methods:**

| Method | Description |
|--------|-------------|
| `umap()` | Computes UMAP embedding |
| `detect_heg(expressed_genes, threshold=3)` | Detects highly expressed genes |
| `filter_gene(threshold)` | Filters genes by expression threshold |
| `detect_microenvironment(search_radius=94)` | Computes local cell type composition |
| `detect_env_gene(sender, receiver, threshold)` | Identifies environment-responsive genes |
| `plot_rank_order()` | Prepares rank-order visualization |
| `prepare_plot_ligrec(...)` | Prepares ligand-receptor visualization |
| `plot_ligrec(genemap, img, img_adata)` | Plots ligand-receptor interactions |

---

## Demo Notebooks

| Dataset | Notebook |
|---------|----------|
| 10x Visium Breast Cancer | [Visium_Breast_Reproducibility.ipynb](demo/Visium_Breast_Reproducibility.ipynb) |
| 10x Visium Adult Mouse Olfactory Bulb | [Visium_bulb_Reproducibility.ipynb](demo/Visium_bulb_Reproducibility.ipynb) |

---

## API Reference

### Core Classes

| Class | Module | Description |
|-------|--------|-------------|
| `celldetector` | `cell_detector` | Nuclei segmentation from H&E images |
| `train_hovernet` | `train_hovernet` | HoVer-Net training pipeline |
| `DINOv2_superres_deconv` | `superres_deconv` | Super-resolution deconvolution |
| `DINOv2NeighborDataset` | `superres_deconv` | PyTorch dataset for DINOv2 |
| `DINOv2NeighborClassifier` | `superres_deconv` | DINOv2 classification model |
| `CellTypeAnnotator` | `celltype_annotator` | Cell type annotation |
| `GeneExpPredictor` | `genexpression_predictor` | Gene expression prediction |
| `microenvironment_analyzer` | `microenvironment_analyzer` | Microenvironment analysis |

### Utility Functions

| Function | Module | Description |
|----------|--------|-------------|
| `configure_logging(logger_name)` | `utils` | Sets up logging configuration |
| `process_json(json_dir)` | `utils` | Parses HoVer-Net JSON output |
| `if_contain(spot, subspot, r, norm)` | `utils` | Spatial containment matrix |
| `if_contain_batch(spot, subspot, r, norm, batch_size)` | `utils` | Batched spatial containment |
| `process_json_from_cellvit(json_dir)` | `cell_detector` | Parses CellViT JSON output |
| `process_json_from_hovernet(json_dir)` | `cell_detector` | Parses HoVer-Net JSON output |

---

## Dependencies

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| Python | >= 3.11 | Runtime |
| NumPy | 1.26.2 | Array operations |
| Pandas | 2.1.4 | Data manipulation |
| SciPy | 1.11.4 | Scientific computing |
| Scanpy | 1.9.6 | Single-cell analysis |
| anndata | 0.10.3 | Annotated data structures |
| scikit-learn | 1.2.2 | Machine learning utilities |
| OpenCV | 4.8 | Image processing |
| Pillow | 9.4.0 | Image I/O |

### Deep Learning Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| PyTorch | 2.4.0 | Deep learning framework |
| torchvision | 0.19.0 | Vision utilities |
| pytorch-lightning | 2.1.2 | Training framework |
| transformers | Latest | DINOv2 model loading |

### Specialized Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| POT | 0.9.1 | Optimal transport |
| gurobipy | 11.0.0 | Integer programming |
| scikit-image | 0.22.0 | Image segmentation |

---

## Data Format Requirements

### Input Data

1. **H&E Image**: High-resolution PNG/TIFF image
2. **Spatial Transcriptomics**: AnnData (h5ad) with:
   - `adata.obsm['spatial']`: Spatial coordinates
   - `adata.X`: Gene expression matrix
   - `adata.uns['radius']`: Spot radius

3. **scRNA-seq Reference**: AnnData (h5ad) with:
   - Cell type annotations in `adata.obs`

### Output Data

| File | Description |
|------|-------------|
| `img_adata_sc.h5ad` | Nuclei segmentation AnnData |
| `sr_adata.h5ad` | Super-resolution deconvolution |
| `whole.json` | Merged nuclei detection results |
| `superres_model.ckpt` | Trained DINOv2 checkpoint |

---

## Reproducibility

For reproducing the analysis from the paper:

```bash
# Navigate to demo directory
cd demo

# Run Jupyter notebooks
jupyter notebook Visium_Breast_Reproducibility.ipynb
jupyter notebook Visium_bulb_Reproducibility.ipynb
```

---

## Citation

If you use PanoSpace in your research, please cite:

```bibtex
@article{he2026panospace,
  title={Unlocking single-cell level and continuous whole-slide insights in spatial transcriptomics with PanoSpace},
  author={He, Hui-Feng and Peng, Peng and Yang, Shun-Ting and others},
  journal={Nature Computational Science},
  year={2026},
  DOI={https://doi.org/10.1038/s43588-025-00938-y}
}
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2024 Hui-Feng He

---

## Contact

For questions, issues, or collaborations:

- **Hui-Feng He**: [huifeng@mails.ccnu.edu.cn](mailto:huifeng@mails.ccnu.edu.cn)
- **Prof. Xiao-Fei Zhang**: [zhangxf@ccnu.edu.cn](mailto:zhangxf@ccnu.edu.cn)

---

## Acknowledgments

- [HoVer-Net](https://github.com/vqdang/hover_net) for nuclei segmentation
- [DINOv2](https://github.com/facebookresearch/dinov2) for vision features
- [PanNuke](https://warwick.ac.uk/fac/cross_fac/tia/data/pannuke/) dataset for training
- [10x Genomics](https://www.10xgenomics.com/) for spatial transcriptomics data
