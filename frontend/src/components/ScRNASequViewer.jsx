import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import './ScRNASequViewer.css'; // Import the CSS file

const ScRNASeqViewer = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [availableGenes, setAvailableGenes] = useState([]);
  const [geneInput, setGeneInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  const clusterPlotRef = useRef(null);
  const genePlotsRef = useRef([]);

  // Load real data from JSON files
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Option 1: Load combined data file
        const response = await fetch('/data/combined_data.json');
        if (!response.ok) throw new Error('Failed to load data');
        
        const jsonData = await response.json();
        
        setData(jsonData);
        setAvailableGenes(jsonData.genes);
        
        // Set default genes if available
        const defaultGenes = ['CD79A', 'MS4A1'].filter(g => 
          jsonData.genes.includes(g)
        );
        setSelectedGenes(defaultGenes.length > 0 ? defaultGenes : [jsonData.genes[0]]);
        
        setLoading(false);
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Draw cluster UMAP
  useEffect(() => {
    if (!data || !clusterPlotRef.current) return;
    
    drawUMAP(clusterPlotRef.current, data.cells, null, 'Cluster UMAP', true);
  }, [data]);

  // Draw gene expression UMAPs
  useEffect(() => {
    if (!data || selectedGenes.length === 0) return;
    
    selectedGenes.forEach((gene, idx) => {
      if (genePlotsRef.current[idx] && data.expressionData[gene]) {
        const cellsWithExpression = data.cells.map((cell, i) => ({
          ...cell,
          expression: data.expressionData[gene][i]
        }));
        drawUMAP(genePlotsRef.current[idx], cellsWithExpression, gene, `Expression of ${gene}`, false);
      }
    });
  }, [data, selectedGenes]);

  const drawUMAP = (container, cells, gene, title, isCluster) => {
    // Clear previous plot
    d3.select(container).selectAll('*').remove();
    
    const margin = { top: 60, right: 150, bottom: 60, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 450 - margin.top - margin.bottom;
    
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Scales
    const xExtent = d3.extent(cells, d => d.umap1);
    const yExtent = d3.extent(cells, d => d.umap2);
    
    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - 1, xExtent[1] + 1])
      .range([0, width]);
    
    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - 1, yExtent[1] + 1])
      .range([height, 0]);
    
    // Color scale
    let colorScale;
    if (isCluster) {
      const clusters = [...new Set(cells.map(d => d.cluster))].sort();
      colorScale = d3.scaleOrdinal()
        .domain(clusters)
        .range(d3.schemeCategory10);
    } else {
      const exprExtent = d3.extent(cells, d => d.expression);
      colorScale = d3.scaleSequential()
        .domain(exprExtent)
        .interpolator(d3.interpolateMagma);
    }
    
    // Tooltip
    const tooltip = d3.select('body')
      .selectAll('.umap-tooltip')
      .data([0])
      .join('div')
      .attr('class', 'umap-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000);
    
    // Draw points
    svg.selectAll('circle')
      .data(cells)
      .join('circle')
      .attr('cx', d => xScale(d.umap1))
      .attr('cy', d => yScale(d.umap2))
      .attr('r', 3)
      .attr('fill', d => isCluster ? colorScale(d.cluster) : colorScale(d.expression))
      .attr('opacity', 0.7)
      .attr('stroke', 'white')
      .attr('stroke-width', 0.5)
      .on('mouseover', (event, d) => {
        const tooltipContent = `
          <strong>Cell:</strong> ${d.id}<br/>
          <strong>Cluster:</strong> ${d.cluster}
          ${d.cellline ? `<br/><strong>Cell Line:</strong> ${d.cellline}` : ''}
          ${d.indication ? `<br/><strong>Indication:</strong> ${d.indication}` : ''}
          ${!isCluster ? `<br/><strong>Expression:</strong> ${d.expression.toFixed(3)}` : ''}
        `;
        tooltip
          .style('opacity', 1)
          .html(tooltipContent);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });
    
    // Axes
    const xAxis = d3.axisBottom(xScale).ticks(5);
    const yAxis = d3.axisLeft(yScale).ticks(5);
    
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .append('text')
      .attr('x', width / 2)
      .attr('y', 40)
      .attr('fill', 'black')
      .attr('font-size', '14px')
      .attr('text-anchor', 'middle')
      .text('UMAP 1');
    
    svg.append('g')
      .call(yAxis)
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -45)
      .attr('fill', 'black')
      .attr('font-size', '14px')
      .attr('text-anchor', 'middle')
      .text('UMAP 2');
    
    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', -30)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .text(title);
    
    // Legend
    if (isCluster) {
      const clusters = [...new Set(cells.map(d => d.cluster))].sort();
      const legend = svg.append('g')
        .attr('transform', `translate(${width + 20}, 0)`);
      
      legend.selectAll('rect')
        .data(clusters)
        .join('rect')
        .attr('x', 0)
        .attr('y', (d, i) => i * 25)
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', d => colorScale(d));
      
      legend.selectAll('text')
        .data(clusters)
        .join('text')
        .attr('x', 20)
        .attr('y', (d, i) => i * 25 + 12)
        .attr('font-size', '12px')
        .text(d => `Cluster ${d}`);
    } else {
      const legendWidth = 20;
      const legendHeight = 200;
      const exprExtent = d3.extent(cells, d => d.expression);
      
      const legendScale = d3.scaleLinear()
        .domain(exprExtent)
        .range([legendHeight, 0]);
      
      const legend = svg.append('g')
        .attr('transform', `translate(${width + 20}, ${(height - legendHeight) / 2})`);
      
      const gradientId = `gradient-${gene || 'expr'}`;
      const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%')
        .attr('x2', '0%')
        .attr('y1', '100%')
        .attr('y2', '0%');
      
      gradient.selectAll('stop')
        .data(d3.range(0, 1.01, 0.1))
        .join('stop')
        .attr('offset', d => `${d * 100}%`)
        .attr('stop-color', d => colorScale(exprExtent[0] + d * (exprExtent[1] - exprExtent[0])));
      
      legend.append('rect')
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', `url(#${gradientId})`);
      
      legend.append('g')
        .attr('transform', `translate(${legendWidth}, 0)`)
        .call(d3.axisRight(legendScale).ticks(5));
      
      legend.append('text')
        .attr('transform', `translate(${legendWidth + 40}, ${legendHeight / 2}) rotate(90)`)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .text('Expression');
    }
  };

  const addGene = (gene) => {
    if (gene && !selectedGenes.includes(gene) && selectedGenes.length < 5) {
      setSelectedGenes([...selectedGenes, gene]);
      setGeneInput('');
      setShowDropdown(false);
    }
  };

  const removeGene = (gene) => {
    setSelectedGenes(selectedGenes.filter(g => g !== gene));
  };

  const filteredGenes = availableGenes.filter(gene =>
    gene.toLowerCase().includes(geneInput.toLowerCase()) &&
    !selectedGenes.includes(gene)
  ).slice(0, 20);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-xl mb-4">Loading scRNA-seq data...</div>
          <div className="text-gray-500">This may take a moment</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-xl font-bold text-red-800 mb-2">Error Loading Data</h2>
          <p className="text-red-600">{error}</p>
          <p className="text-sm text-gray-600 mt-4">
            Make sure the data files are in the <code className="bg-gray-100 px-1 rounded">public/data/</code> directory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="scrna-container">
      <div className="scrna-wrapper">
        <h1 className="scrna-header">
          scRNA-seq Visualization
        </h1>
        
        <div className="scrna-layout">
          {/* Sidebar */}
          <div className="scrna-sidebar">
            {/* Dataset info - Now at the top */}
            <div className="dataset-info-box">
              <h3>Dataset Information</h3>
              <p><strong>Cells:</strong> {data.cells.length.toLocaleString()}</p>
              <p><strong>Clusters:</strong> {new Set(data.cells.map(c => c.cluster)).size}</p>
              <p><strong>Available genes:</strong> {data.genes.length.toLocaleString()}</p>
              {data.metadata && (
                <p><strong>Genes with expression:</strong> {data.metadata.genes_exported?.toLocaleString() || 'N/A'}</p>
              )}
            </div>
            
            {/* Gene selection box - Now below dataset info */}
            <div className="gene-selection-box">
              <h2 className="gene-selection-title">Gene Selection</h2>
              
              {/* Selected genes */}
              <div className="selected-genes-container">
                <label className="selected-genes-label">
                  Selected genes ({selectedGenes.length}/5):
                </label>
                <div className="selected-genes-list">
                  {selectedGenes.map(gene => (
                    <span key={gene} className="gene-tag">
                      {gene}
                      <button
                        onClick={() => removeGene(gene)}
                        className="gene-tag-remove"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Gene input */}
              {selectedGenes.length < 5 && (
                <div className="gene-input-container">
                  <input
                    type="text"
                    value={geneInput}
                    onChange={(e) => {
                      setGeneInput(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    placeholder="Type to search genes..."
                    className="gene-input"
                  />
                  
                  {showDropdown && geneInput && filteredGenes.length > 0 && (
                    <div className="gene-dropdown">
                      {filteredGenes.map(gene => (
                        <div
                          key={gene}
                          onClick={() => addGene(gene)}
                          className="gene-dropdown-item"
                        >
                          {gene}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Info box at bottom */}
            <div className="info-box">
              💡 Hover over points to see details for each cell.
            </div>
          </div>
          
          {/* Main content */}
          <div className="scrna-main">
            {/* Cluster UMAP */}
            <div className="plot-container">
              <div ref={clusterPlotRef}></div>
            </div>
            
            {/* Gene expression UMAPs */}
            {selectedGenes.length > 0 && (
              <div className="gene-plots-section">
                <h2 className="gene-plots-title">Gene Expression UMAP</h2>
                {selectedGenes.map((gene, idx) => (
                  <div key={gene} className="plot-container">
                    {data.expressionData[gene] ? (
                      <div ref={el => genePlotsRef.current[idx] = el}></div>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <p className="text-lg">Expression data not available for {gene}</p>
                        <p className="text-sm mt-2">This gene may not be in the exported dataset</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {selectedGenes.length === 0 && (
              <div className="empty-state">
                <h3>No genes selected</h3>
                <p>Select genes from the sidebar to visualize their expression.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScRNASeqViewer;