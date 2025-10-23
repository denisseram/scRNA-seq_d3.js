import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import './ScRNASeqViewer.css'; // Import the CSS file

const ScRNASeqViewer = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [availableGenes, setAvailableGenes] = useState([]);
  const [expressedGenes, setExpressedGenes] = useState([]);
  const [geneInput, setGeneInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeView, setActiveView] = useState('umap'); // 'umap' or 'boxplot'
  
  // Boxplot specific states
  const [boxplotGene, setBoxplotGene] = useState('');
  const [boxplotGroupBy, setBoxplotGroupBy] = useState('indication'); // 'indication' or 'cellline'
  const [selectedIndication, setSelectedIndication] = useState('all');
  const [availableIndications, setAvailableIndications] = useState([]);
  const [availableCellLines, setAvailableCellLines] = useState([]);
  
  const clusterPlotRef = useRef(null);
  const genePlotsRef = useRef([]);
  const boxplotRef = useRef(null);

  // Load real data from JSON files
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        const response = await fetch('/data/combined_data.json');
        if (!response.ok) throw new Error('Failed to load data');
        
        const jsonData = await response.json();
        
        setData(jsonData);
        setAvailableGenes(jsonData.genes);
        
        // Filter only genes that have expression data
        const genesWithExpression = jsonData.genes.filter(gene => 
          jsonData.expressionData && jsonData.expressionData[gene]
        );
        setExpressedGenes(genesWithExpression);
        
        // Extract unique indications and cell lines
        const indications = [...new Set(jsonData.cells.map(c => c.indication).filter(Boolean))];
        const cellLines = [...new Set(jsonData.cells.map(c => c.cellline).filter(Boolean))];
        setAvailableIndications(indications);
        setAvailableCellLines(cellLines);
        
        // Set default genes
        const defaultGenes = ['CD79A', 'MS4A1'].filter(g => 
          genesWithExpression.includes(g)
        );
        setSelectedGenes(defaultGenes.length > 0 ? defaultGenes : 
          (genesWithExpression.length > 0 ? [genesWithExpression[0]] : [])
        );
        
        // Set default boxplot gene
        const defaultBoxplotGene = genesWithExpression.includes('ERBB2') ? 'ERBB2' : genesWithExpression[0];
        setBoxplotGene(defaultBoxplotGene);
        
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
    if (!data || !clusterPlotRef.current || activeView !== 'umap') return;
    
    drawUMAP(clusterPlotRef.current, data.cells, null, 'Cluster UMAP', true);
  }, [data, activeView]);

  // Draw gene expression UMAPs
  useEffect(() => {
    if (!data || selectedGenes.length === 0 || activeView !== 'umap') return;
    
    selectedGenes.forEach((gene, idx) => {
      if (genePlotsRef.current[idx] && data.expressionData[gene]) {
        const cellsWithExpression = data.cells.map((cell, i) => ({
          ...cell,
          expression: data.expressionData[gene][i]
        }));
        drawUMAP(genePlotsRef.current[idx], cellsWithExpression, gene, `Expression of ${gene}`, false);
      }
    });
  }, [data, selectedGenes, activeView]);

  // Draw boxplot
  useEffect(() => {
    if (!data || !boxplotRef.current || activeView !== 'boxplot' || !boxplotGene) return;
    
    drawBoxplot();
  }, [data, activeView, boxplotGene, boxplotGroupBy, selectedIndication]);

  const drawUMAP = (container, cells, gene, title, isCluster) => {
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
    
    const xExtent = d3.extent(cells, d => d.umap1);
    const yExtent = d3.extent(cells, d => d.umap2);
    
    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - 1, xExtent[1] + 1])
      .range([0, width]);
    
    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - 1, yExtent[1] + 1])
      .range([height, 0]);
    
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
        tooltip.style('opacity', 1).html(tooltipContent);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });
    
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
    
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', -30)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .text(title);
    
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

  const drawBoxplot = () => {
    d3.select(boxplotRef.current).selectAll('*').remove();
    
    if (!data.expressionData[boxplotGene]) return;
    
    // Filter cells based on selection
    let filteredCells = data.cells;
    if (boxplotGroupBy === 'cellline' && selectedIndication !== 'all') {
      filteredCells = data.cells.filter(c => c.indication === selectedIndication);
    }
    
    // Prepare data with log2 expression
    const cellData = filteredCells.map((cell, i) => {
      const originalIndex = data.cells.indexOf(cell);
      const expression = data.expressionData[boxplotGene][originalIndex];
      return {
        ...cell,
        expression: expression,
        log2Expression: Math.log2(expression + 1),
        group: boxplotGroupBy === 'indication' ? cell.indication : cell.cellline
      };
    }).filter(d => d.group); // Filter out cells without group info
    
    // Group data
    const groupedData = d3.group(cellData, d => d.group);
    const groups = Array.from(groupedData.keys()).sort();
    
    const margin = { top: 80, right: 40, bottom: 120, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;
    
    const svg = d3.select(boxplotRef.current)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Scales
    const xScale = d3.scaleBand()
      .domain(groups)
      .range([0, width])
      .padding(0.3);
    
    const yExtent = d3.extent(cellData, d => d.log2Expression);
    const yScale = d3.scaleLinear()
      .domain([0, yExtent[1] * 1.1])
      .range([height, 0]);
    
    // Calculate boxplot statistics
    const boxplotData = groups.map(group => {
      const values = groupedData.get(group).map(d => d.log2Expression).sort(d3.ascending);
      const q1 = d3.quantile(values, 0.25);
      const median = d3.quantile(values, 0.5);
      const q3 = d3.quantile(values, 0.75);
      const iqr = q3 - q1;
      const min = Math.max(d3.min(values), q1 - 1.5 * iqr);
      const max = Math.min(d3.max(values), q3 + 1.5 * iqr);
      
      return { group, min, q1, median, q3, max, values: groupedData.get(group) };
    });
    
    // Draw boxes
    const boxWidth = xScale.bandwidth();
    
    boxplotData.forEach(d => {
      const x = xScale(d.group);
      
      // Vertical line (min to max)
      svg.append('line')
        .attr('x1', x + boxWidth / 2)
        .attr('x2', x + boxWidth / 2)
        .attr('y1', yScale(d.min))
        .attr('y2', yScale(d.max))
        .attr('stroke', '#666')
        .attr('stroke-width', 1);
      
      // Box (Q1 to Q3)
      svg.append('rect')
        .attr('x', x)
        .attr('y', yScale(d.q3))
        .attr('width', boxWidth)
        .attr('height', yScale(d.q1) - yScale(d.q3))
        .attr('fill', '#4a90e2')
        .attr('opacity', 0.7)
        .attr('stroke', '#2c5aa0')
        .attr('stroke-width', 1.5);
      
      // Median line
      svg.append('line')
        .attr('x1', x)
        .attr('x2', x + boxWidth)
        .attr('y1', yScale(d.median))
        .attr('y2', yScale(d.median))
        .attr('stroke', '#000')
        .attr('stroke-width', 2);
      
      // Min/max whiskers
      [d.min, d.max].forEach(val => {
        svg.append('line')
          .attr('x1', x + boxWidth * 0.25)
          .attr('x2', x + boxWidth * 0.75)
          .attr('y1', yScale(val))
          .attr('y2', yScale(val))
          .attr('stroke', '#666')
          .attr('stroke-width', 1);
      });
    });
    
    // Add jittered points (strip plot)
    const jitterWidth = xScale.bandwidth() * 0.4;
    
    boxplotData.forEach(d => {
      svg.selectAll(`.point-${d.group}`)
        .data(d.values)
        .join('circle')
        .attr('class', `point-${d.group}`)
        .attr('cx', () => xScale(d.group) + xScale.bandwidth() / 2 + (Math.random() - 0.5) * jitterWidth)
        .attr('cy', cell => yScale(cell.log2Expression))
        .attr('r', 2)
        .attr('fill', 'black')
        .attr('opacity', 0.3);
    });
    
    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em');
    
    svg.append('g')
      .call(d3.axisLeft(yScale));
    
    // Labels
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .text(`${boxplotGene} Expression by ${boxplotGroupBy === 'indication' ? 'Indication' : 'Cell Line'}${boxplotGroupBy === 'cellline' && selectedIndication !== 'all' ? ` (${selectedIndication})` : ''}`);
    
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .text('log2(Expression + 1)');
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

  const filteredGenes = expressedGenes.filter(gene =>
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
        
        {/* Navigation Tabs */}
        <div style={{marginBottom: '2rem', borderBottom: '2px solid #e5e7eb'}}>
          <div style={{display: 'flex', gap: '1rem'}}>
            <button
              onClick={() => setActiveView('umap')}
              style={{
                padding: '0.75rem 1.5rem',
                background: activeView === 'umap' ? '#3b82f6' : 'transparent',
                color: activeView === 'umap' ? 'white' : '#4b5563',
                border: 'none',
                borderBottom: activeView === 'umap' ? '3px solid #2563eb' : '3px solid transparent',
                fontWeight: activeView === 'umap' ? '600' : '500',
                cursor: 'pointer',
                fontSize: '1rem',
                transition: 'all 0.2s'
              }}
            >
              UMAP Visualization
            </button>
            <button
              onClick={() => setActiveView('boxplot')}
              style={{
                padding: '0.75rem 1.5rem',
                background: activeView === 'boxplot' ? '#3b82f6' : 'transparent',
                color: activeView === 'boxplot' ? 'white' : '#4b5563',
                border: 'none',
                borderBottom: activeView === 'boxplot' ? '3px solid #2563eb' : '3px solid transparent',
                fontWeight: activeView === 'boxplot' ? '600' : '500',
                cursor: 'pointer',
                fontSize: '1rem',
                transition: 'all 0.2s'
              }}
            >
              Gene Expression Boxplot
            </button>
          </div>
        </div>
        
        <div className="scrna-layout">
          {/* Sidebar - UMAP View */}
          {activeView === 'umap' && (
            <div className="scrna-sidebar">
              <div className="dataset-info-box">
                <h3>Dataset Information</h3>
                <p><strong>Cells:</strong> {data.cells.length.toLocaleString()}</p>
                <p><strong>Clusters:</strong> {new Set(data.cells.map(c => c.cluster)).size}</p>
                <p><strong>Total genes:</strong> {data.genes.length.toLocaleString()}</p>
                <p><strong>Expressed genes:</strong> {expressedGenes.length.toLocaleString()}</p>
              </div>
              
              <div className="gene-selection-box">
                <h2 className="gene-selection-title">Gene Selection</h2>
                
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
                      placeholder="Search expressed genes..."
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
                    
                    {showDropdown && geneInput && filteredGenes.length === 0 && (
                      <div className="gene-dropdown">
                        <div className="gene-dropdown-item" style={{color: '#6b7280', cursor: 'default'}}>
                          No expressed genes found
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="info-box">
                💡 Only genes with expression data are available for selection. Hover over points to see cell details.
              </div>
            </div>
          )}
          
          {/* Sidebar - Boxplot View */}
          {activeView === 'boxplot' && (
            <div className="scrna-sidebar">
              <div className="dataset-info-box">
                <h3>Dataset Information</h3>
                <p><strong>Cells:</strong> {data.cells.length.toLocaleString()}</p>
                <p><strong>Indications:</strong> {availableIndications.length}</p>
                <p><strong>Cell Lines:</strong> {availableCellLines.length}</p>
                <p><strong>Expressed genes:</strong> {expressedGenes.length.toLocaleString()}</p>
              </div>
              
              <div className="gene-selection-box">
                <h2 className="gene-selection-title">Boxplot Settings</h2>
                
                <div style={{marginBottom: '1.5rem'}}>
                  <label className="selected-genes-label">Select Gene:</label>
                  <select
                    value={boxplotGene}
                    onChange={(e) => setBoxplotGene(e.target.value)}
                    className="gene-input"
                    style={{cursor: 'pointer'}}
                  >
                    {expressedGenes.map(gene => (
                      <option key={gene} value={gene}>{gene}</option>
                    ))}
                  </select>
                </div>
                
                <div style={{marginBottom: '1.5rem'}}>
                  <label className="selected-genes-label">Group By:</label>
                  <select
                    value={boxplotGroupBy}
                    onChange={(e) => setBoxplotGroupBy(e.target.value)}
                    className="gene-input"
                    style={{cursor: 'pointer'}}
                  >
                    <option value="indication">Indication</option>
                    <option value="cellline">Cell Line</option>
                  </select>
                </div>
                
                {boxplotGroupBy === 'cellline' && (
                  <div style={{marginBottom: '1.5rem'}}>
                    <label className="selected-genes-label">Filter by Indication:</label>
                    <select
                      value={selectedIndication}
                      onChange={(e) => setSelectedIndication(e.target.value)}
                      className="gene-input"
                      style={{cursor: 'pointer'}}
                    >
                      <option value="all">All Indications</option>
                      {availableIndications.map(ind => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              
              <div className="info-box">
                📊 Boxplot shows log2(expression + 1) values. Black dots represent individual cells with jitter for visibility.
              </div>
            </div>
          )}
          
          {/* Main content */}
          <div className="scrna-main">
            {activeView === 'umap' && (
              <>
                <div className="plot-container">
                  <div ref={clusterPlotRef}></div>
                </div>
                
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
              </>
            )}
            
            {activeView === 'boxplot' && (
              <div className="plot-container">
                <div ref={boxplotRef}></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScRNASeqViewer;