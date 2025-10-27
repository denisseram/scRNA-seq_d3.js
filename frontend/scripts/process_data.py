import os
import json
import pandas as pd
import numpy as np
import scanpy as sc
import anndata
import scipy.sparse

# ==============================================================================
# 1. LOAD AND PROCESS DATA
# ==============================================================================

cwd = os.getcwd()
print("Loading metadata...")
meta = pd.read_csv(cwd + '/public/data/Metadata.txt', sep='\t')
meta.drop([0], axis=0, inplace=True)
meta.rename(columns={
    'NAME': 'CellID', 
    'Cell_line': 'CellLine', 
    'Pool_ID': 'Pool', 
    'Cancer_type': 'Indication'
}, inplace=True)

print("Loading UMI counts...")
counts_cellid = pd.read_csv(cwd + '/public/data/UMIcount_data.txt', nrows=1, sep='\t', header=None)
counts_cellid = counts_cellid.transpose()
counts_cellid.drop([0], inplace=True)

counts = pd.read_csv(cwd + '/public/data/UMIcount_data.txt', sep='\t', skiprows=3, header=None, index_col=0)
counts = counts.transpose()
counts.index = counts_cellid[0]
counts.index.name = None

# Filter cells present in metadata
a = counts.index.isin(meta['CellID'])
counts = counts[a]

meta = meta.set_index('CellID')
meta = meta.reindex(index=counts.index)

print(f"Creating AnnData object with {counts.shape[0]} cells and {counts.shape[1]} genes...")
adata = anndata.AnnData(
    X=scipy.sparse.csr_matrix(counts),
    obs=meta,
    var=pd.DataFrame(index=counts.columns)
)
del counts

# Filter genes and cells
print("Filtering genes and cells...")
sc.pp.filter_genes(adata, min_cells=10)
sc.pp.filter_cells(adata, min_genes=200)

print(f"After filtering: {adata.n_obs} cells, {adata.n_vars} genes")

# ==============================================================================
# 2. NORAMLIZATION AND DR
# ==============================================================================

print("Normalizing data...")
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)

print("Finding highly variable genes...")
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

print("Scaling data...")
sc.pp.scale(adata, max_value=10)

print("Running PCA...")
sc.tl.pca(adata, n_comps=50)

print("Computing neighborhood graph...")
sc.pp.neighbors(adata, n_neighbors=10, n_pcs=30)

print("Running UMAP...")
sc.tl.umap(adata)

print("Clustering cells...")
sc.tl.leiden(adata, resolution=0.5)

# ==============================================================================
# 3. EXPORT DATA FOR REACT (fingers crossed it will work )
# ==============================================================================

output_dir = cwd + '/public/data'
os.makedirs(output_dir, exist_ok=True)

print("\nExporting data for React app...")

# 3.1 Export cell information with UMAP coordinates
print("Exporting cell data...")
cells_data = []
for idx, cell_id in enumerate(adata.obs.index):
    cell_info = {
        'id': cell_id,
        'umap1': float(adata.obsm['X_umap'][idx, 0]),
        'umap2': float(adata.obsm['X_umap'][idx, 1]),
        'cluster': str(adata.obs['leiden'][idx])
    }
    
    # Add metadata
    for col in ['CellLine', 'Pool', 'Indication']:
        if col in adata.obs.columns:
            cell_info[col.lower()] = str(adata.obs[col][idx])
    
    cells_data.append(cell_info)

with open(f'{output_dir}/cells.json', 'w') as f:
    json.dump(cells_data, f)

print(f"✓ Exported {len(cells_data)} cells")

# 3.2 Export gene list (sorted alphabetically)
print("Exporting gene list...")
genes_list = sorted(adata.var.index.tolist())

with open(f'{output_dir}/genes.json', 'w') as f:
    json.dump(genes_list, f)

print(f"✓ Exported {len(genes_list)} genes")

# 3.3 Export normalized expression data
# We'll export the top variable genes + some marker genes
print("Exporting expression data...")

# Get top variable genes
top_genes = adata.var.nsmallest(500, 'dispersions_norm').index.tolist() if 'dispersions_norm' in adata.var.columns else adata.var.index[:500].tolist()

# Add common marker genes if they exist
marker_genes = ['CD79A', 'MS4A1', 'CD3D', 'CD8A', 'CD4', 'IL7R', 'CCR7',
                'NKG7', 'GNLY', 'FCGR3A', 'MS4A7', 'LYZ', 'CD14']
for gene in marker_genes:
    if gene in adata.var.index and gene not in top_genes:
        top_genes.append(gene)

# Get normalized expression (from log-transformed data)
expression_data = {}
for gene in top_genes:
    if gene in adata.var.index:
        # Get expression values from the normalized data layer
        expr_values = adata[:, gene].X
        if scipy.sparse.issparse(expr_values):
            expr_values = expr_values.toarray().flatten()
        else:
            expr_values = expr_values.flatten()
        
        expression_data[gene] = expr_values.tolist()

with open(f'{output_dir}/expression.json', 'w') as f:
    json.dump(expression_data, f)

print(f"✓ Exported expression data for {len(expression_data)} genes")

# 3.4 Export metadata summary
print("Exporting metadata...")
metadata = {
    'n_cells': int(adata.n_obs),
    'n_genes': int(adata.n_vars),
    'n_clusters': len(adata.obs['leiden'].unique()),
    'genes_exported': len(expression_data),
    'cell_metadata_fields': [col for col in adata.obs.columns if col != 'leiden']
}

with open(f'{output_dir}/metadata.json', 'w') as f:
    json.dump(metadata, f, indent=2)

print(f"Exported metadata")

# ==============================================================================
# 4. option of exporting only a file with all data combined (only for small datasets))
# ==============================================================================

print("\nCreating combined data file...")
combined_data = {
    'cells': cells_data,
    'genes': genes_list,
    'expressionData': expression_data,
    'metadata': metadata
}

with open(f'{output_dir}/combined_data.json', 'w') as f:
    json.dump(combined_data, f)

print("✓ Exported combined data file")

print("\n" + "="*50)
print("DATA EXPORT COMPLETE!")
print("="*50)
print(f"\nFiles created in: {output_dir}/")
print("- cells.json")
print("- genes.json")
print("- expression.json")
print("- metadata.json")
print("- combined_data.json")
print("\nYou can now use these files in your React app!")