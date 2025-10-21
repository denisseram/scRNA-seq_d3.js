## Interactive Dashboard for Single-Cell Data Visualization

This project provides an **interactive dashboard** designed to visualize **single-cell RNA-seq data**.  
As a demonstration, it replicates the figures presented in the paper:  
> [**Pan-cancer single-cell RNA-seq identifies recurring programs of cellular heterogeneity**](https://www.nature.com/articles/s41588-020-00726-6)

### Features
- Interactive visualization of single-cell data  
- Easy integration with your own datasets  
- Reproduction of figures from a high-impact publication  

### How to Run
You can use the provided example data or upload your own files.

To use your own data:
1. Prepare two `.txt` files:
   - `Metadata.txt`
   - `UMIcount_data.txt`
2. Place them in the folder:
  ./frontend/public/data/
3. Run the preprocessing script:
```bash
python ./frontend/scripts/process_data.py 
```

### Data Format Requirements

- Metadata.txt: Contains cell-level annotations (e.g., cluster, sample, condition).
- UMIcount_data.txt: Contains gene expression counts (UMI matrix).

Make sure both files are tab-delimited (.txt with \t separators).