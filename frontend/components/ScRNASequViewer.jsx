import React, { useState, useEffect, useRef, use } from 'react';
import * as d3 from 'd3';   

const ScRNASequViewer = () => {
    const [data, SetData] = useState(null);
    const [selectedGenes, setSelectedGenes] = useState(['CD78A', 'MS4A1']);
    const [availableGebes, setAvailableGenes] = useState([]);
    const [geneInput, setGeneInput] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const clusterPlotRef = useRef(null);
    const genePlotsRef = useRef([]);

    //load the data
    //useEffect(() => {
       
    //}

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
      const clusters = [...new Set(cells.map(d => d.cluster))];
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
        tooltip
          .style('opacity', 1)
          .html(`
            <strong>Cell:</strong> ${d.id}<br/>
            <strong>Cluster:</strong> ${d.cluster}
            ${!isCluster ? `<br/><strong>Expression:</strong> ${d.expression.toFixed(3)}` : ''}
          `);
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
      const clusters = [...new Set(cells.map(d => d.cluster))];
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
      
      const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', `gradient-${gene}`)
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
        .style('fill', `url(#gradient-${gene})`);
      
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

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading PBMC3k data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">
          scRNA-seq Visualization: pbmc3k Dataset
        </h1>
        
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-80 bg-white p-6 rounded-lg shadow-md h-fit">
            <h2 className="text-xl font-semibold mb-4">Gene Selection</h2>
            
            {/* Selected genes */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selected genes ({selectedGenes.length}/5):
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedGenes.map(gene => (
                  <span
                    key={gene}
                    className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                  >
                    {gene}
                    <button
                      onClick={() => removeGene(gene)}
                      className="text-blue-600 hover:text-blue-800 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
            
            {/* Gene input */}
            {selectedGenes.length < 5 && (
              <div className="relative mb-6">
                <input
                  type="text"
                  value={geneInput}
                  onChange={(e) => {
                    setGeneInput(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Type to search genes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                
                {showDropdown && geneInput && filteredGenes.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredGenes.map(gene => (
                      <div
                        key={gene}
                        onClick={() => addGene(gene)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                      >
                        {gene}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <hr className="my-6" />
            
            {/* Dataset info */}
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold text-gray-700 mb-3">Dataset Information</h3>
              <p><strong>Cells:</strong> {data.cells.length}</p>
              <p><strong>Clusters:</strong> {new Set(data.cells.map(c => c.cluster)).size}</p>
              <p><strong>Available genes:</strong> {data.genes.length}</p>
            </div>
            
            <div className="mt-6 p-3 bg-blue-50 rounded-md text-xs text-gray-600">
              💡 Hover over points to see details for each cell.
            </div>
          </div>
          
          {/* Main content */}
          <div className="flex-1">
            {/* Cluster UMAP */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
              <div ref={clusterPlotRef}></div>
            </div>
            
            {/* Gene expression UMAPs */}
            {selectedGenes.length > 0 && (
              <div className="space-y-8">
                <h2 className="text-2xl font-semibold text-gray-800">Gene Expression UMAP</h2>
                {selectedGenes.map((gene, idx) => (
                  <div key={gene} className="bg-white p-6 rounded-lg shadow-md">
                    <div ref={el => genePlotsRef.current[idx] = el}></div>
                  </div>
                ))}
              </div>
            )}
            
            {selectedGenes.length === 0 && (
              <div className="bg-white p-12 rounded-lg shadow-md text-center text-gray-500">
                <h3 className="text-xl mb-2">No genes selected</h3>
                <p>Select genes from the sidebar to visualize their expression.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScRNASequViewer;