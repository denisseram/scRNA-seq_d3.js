import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

const ScRNASeqViewer = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [availableGenes, setAvailableGenes] = useState([]);
  const [expressedGenes, setExpressedGenes] = useState([]);
  const [geneInput, setGeneInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeView, setActiveView] = useState('umap');
  
  const [boxplotGene, setBoxplotGene] = useState('');
  const [boxplotGroupBy, setBoxplotGroupBy] = useState('indication');
  const [selectedIndication, setSelectedIndication] = useState('all');
  const [availableIndications, setAvailableIndications] = useState([]);
  const [availableCellLines, setAvailableCellLines] = useState([]);
  const [boxplotLoading, setBoxplotLoading] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  
  const clusterCanvasRef = useRef(null);
  const geneCanvasRefs = useRef([]);
  const boxplotRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        const response = await fetch('/data/combined_data.json');
        if (!response.ok) throw new Error('Failed to load data');
        
        const jsonData = await response.json();
        
        setData(jsonData);
        setAvailableGenes(jsonData.genes);
        
        const genesWithExpression = jsonData.genes.filter(gene => 
          jsonData.expressionData && jsonData.expressionData[gene]
        );
        setExpressedGenes(genesWithExpression);
        
        const indications = [...new Set(jsonData.cells.map(c => c.indication).filter(Boolean))];
        const cellLines = [...new Set(jsonData.cells.map(c => c.cellline).filter(Boolean))];
        setAvailableIndications(indications);
        setAvailableCellLines(cellLines);
        
        const defaultGenes = ['CD79A', 'MS4A1'].filter(g => 
          genesWithExpression.includes(g)
        );
        setSelectedGenes(defaultGenes.length > 0 ? defaultGenes : 
          (genesWithExpression.length > 0 ? [genesWithExpression[0]] : [])
        );
        
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

  useEffect(() => {
    if (!data || !clusterCanvasRef.current || activeView !== 'umap') return;
    drawUMAPCanvas(clusterCanvasRef.current, data.cells, null, 'Cluster UMAP', true);
  }, [data, activeView]);

  useEffect(() => {
    if (!data || selectedGenes.length === 0 || activeView !== 'umap') return;
    
    selectedGenes.forEach((gene, idx) => {
      if (geneCanvasRefs.current[idx] && data.expressionData[gene]) {
        const cellsWithExpression = data.cells.map((cell, i) => ({
          ...cell,
          expression: data.expressionData[gene][i]
        }));
        drawUMAPCanvas(geneCanvasRefs.current[idx], cellsWithExpression, gene, `Expression of ${gene}`, false);
      }
    });
  }, [data, selectedGenes, activeView]);

  useEffect(() => {
    if (!data || !boxplotRef.current || activeView !== 'boxplot' || !boxplotGene) return;
    
    setBoxplotLoading(true);
    setTimeout(() => {
      drawBoxplot();
      setBoxplotLoading(false);
    }, 50);
  }, [data, activeView, boxplotGene, boxplotGroupBy, selectedIndication]);

  const drawUMAPCanvas = (container, cells, gene, title, isCluster) => {
    // Clear container
    container.innerHTML = '';
    
    const margin = { top: 60, right: 150, bottom: 60, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 450 - margin.top - margin.bottom;
    const totalWidth = width + margin.left + margin.right;
    const totalHeight = height + margin.top + margin.bottom;
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = totalWidth * 2; // 2x for retina
    canvas.height = totalHeight * 2;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2); // Scale for retina
    
    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, totalWidth, totalHeight);
    
    // Calculate scales
    const xExtent = d3.extent(cells, d => d.umap1);
    const yExtent = d3.extent(cells, d => d.umap2);
    
    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - 1, xExtent[1] + 1])
      .range([margin.left, margin.left + width]);
    
    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - 1, yExtent[1] + 1])
      .range([margin.top + height, margin.top]);
    
    // Setup color scales
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
    
    // Draw points
    cells.forEach(cell => {
      const x = xScale(cell.umap1);
      const y = yScale(cell.umap2);
      const color = isCluster ? colorScale(cell.cluster) : colorScale(cell.expression);
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });
    
    // Draw axes and labels using SVG overlay
    const svg = d3.select(container)
      .append('svg')
      .attr('width', totalWidth)
      .attr('height', totalHeight)
      .style('position', 'absolute')
      .style('top', 0)
      .style('left', 0)
      .style('pointer-events', 'none')
      .append('g');
    
    // X axis
    const xAxis = d3.axisBottom(xScale.copy().range([0, width])).ticks(5);
    svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top + height})`)
      .style('pointer-events', 'all')
      .call(xAxis)
      .append('text')
      .attr('x', width / 2)
      .attr('y', 40)
      .attr('fill', 'black')
      .attr('font-size', '14px')
      .attr('text-anchor', 'middle')
      .text('UMAP 1');
    
    // Y axis
    const yAxis = d3.axisLeft(yScale.copy().range([height, 0])).ticks(5);
    svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .style('pointer-events', 'all')
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
      .attr('x', margin.left + width / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .text(title);
    
    // Legend
    if (isCluster) {
      const clusters = [...new Set(cells.map(d => d.cluster))].sort();
      const legend = svg.append('g')
        .attr('transform', `translate(${margin.left + width + 20}, ${margin.top})`);
      
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
        .attr('transform', `translate(${margin.left + width + 20}, ${margin.top + (height - legendHeight) / 2})`);
      
      const gradientId = `gradient-${gene || 'expr'}`;
      svg.append('defs')
        .append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%')
        .attr('x2', '0%')
        .attr('y1', '100%')
        .attr('y2', '0%')
        .selectAll('stop')
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
    
    // Add mouse interaction
    canvas.style.pointerEvents = 'all';
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const dataX = xScale.invert(x);
      const dataY = yScale.invert(y);
      
      // Find closest cell
      let closestCell = null;
      let minDist = Infinity;
      
      cells.forEach(cell => {
        const dist = Math.sqrt(
          Math.pow(cell.umap1 - dataX, 2) + 
          Math.pow(cell.umap2 - dataY, 2)
        );
        if (dist < minDist && dist < 0.5) { // threshold
          minDist = dist;
          closestCell = cell;
        }
      });
      
      if (closestCell) {
        setHoveredCell(closestCell);
        setTooltipPos({ x: e.clientX, y: e.clientY });
      } else {
        setHoveredCell(null);
      }
    });
    
    canvas.addEventListener('mouseleave', () => {
      setHoveredCell(null);
    });
  };

  const drawBoxplot = () => {
    d3.select(boxplotRef.current).selectAll('*').remove();
    
    if (!data.expressionData[boxplotGene]) return;
    
    let filteredCells = data.cells;
    if (boxplotGroupBy === 'cellline' && selectedIndication !== 'all') {
      filteredCells = data.cells.filter(c => c.indication === selectedIndication);
    }
    
    const cellData = [];
    filteredCells.forEach((cell) => {
      const originalIndex = data.cells.indexOf(cell);
      const expression = data.expressionData[boxplotGene][originalIndex];
      const group = boxplotGroupBy === 'indication' ? cell.indication : cell.cellline;
      
      if (group && expression !== undefined && expression !== null && !isNaN(expression)) {
        cellData.push({
          id: cell.id,
          expression: expression,
          log2Expression: Math.log2(expression + 1),
          group: group
        });
      }
    });
    
    if (cellData.length === 0) return;
    
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
    
    const xScale = d3.scaleBand()
      .domain(groups)
      .range([0, width])
      .padding(0.3);
    
    const yExtent = d3.extent(cellData, d => d.log2Expression);
    const yScale = d3.scaleLinear()
      .domain([0, yExtent[1] * 1.1])
      .range([height, 0]);
    
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
    
    const boxWidth = xScale.bandwidth();
    
    boxplotData.forEach(d => {
      const x = xScale(d.group);
      
      svg.append('line')
        .attr('x1', x + boxWidth / 2)
        .attr('x2', x + boxWidth / 2)
        .attr('y1', yScale(d.min))
        .attr('y2', yScale(d.max))
        .attr('stroke', '#666')
        .attr('stroke-width', 1);
      
      svg.append('rect')
        .attr('x', x)
        .attr('y', yScale(d.q3))
        .attr('width', boxWidth)
        .attr('height', yScale(d.q1) - yScale(d.q3))
        .attr('fill', '#4a90e2')
        .attr('opacity', 0.7)
        .attr('stroke', '#2c5aa0')
        .attr('stroke-width', 1.5);
      
      svg.append('line')
        .attr('x1', x)
        .attr('x2', x + boxWidth)
        .attr('y1', yScale(d.median))
        .attr('y2', yScale(d.median))
        .attr('stroke', '#000')
        .attr('stroke-width', 2);
      
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
    
    const jitterWidth = xScale.bandwidth() * 0.4;
    const maxPointsPerGroup = 500;
    
    boxplotData.forEach(d => {
      let pointsToPlot = d.values;
      if (pointsToPlot.length > maxPointsPerGroup) {
        const step = Math.floor(pointsToPlot.length / maxPointsPerGroup);
        pointsToPlot = pointsToPlot.filter((_, i) => i % step === 0);
      }
      
      const jitteredData = pointsToPlot.map(cell => ({
        x: xScale(d.group) + xScale.bandwidth() / 2 + (Math.random() - 0.5) * jitterWidth,
        y: yScale(cell.log2Expression)
      }));
      
      svg.selectAll(`.point-${d.group.replace(/\s+/g, '-')}`)
        .data(jitteredData)
        .join('circle')
        .attr('class', `point-${d.group.replace(/\s+/g, '-')}`)
        .attr('cx', p => p.x)
        .attr('cy', p => p.y)
        .attr('r', 1.5)
        .attr('fill', 'black')
        .attr('opacity', 0.4);
    });
    
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
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh'}}>
        <div style={{textAlign: 'center'}}>
          <div style={{fontSize: '1.25rem', marginBottom: '1rem'}}>Loading scRNA-seq data...</div>
          <div style={{color: '#6b7280'}}>This may take a moment</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh'}}>
        <div style={{background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '1.5rem', maxWidth: '28rem'}}>
          <h2 style={{fontSize: '1.25rem', fontWeight: 'bold', color: '#991b1b', marginBottom: '0.5rem'}}>Error Loading Data</h2>
          <p style={{color: '#dc2626'}}>{error}</p>
          <p style={{fontSize: '0.875rem', color: '#4b5563', marginTop: '1rem'}}>
            Make sure the data files are in the <code style={{background: '#f3f4f6', padding: '0.125rem 0.25rem', borderRadius: '0.25rem'}}>public/data/</code> directory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{padding: '2rem', maxWidth: '1600px', margin: '0 auto'}}>
      <h1 style={{fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem'}}>
        scRNA-seq Visualization
      </h1>
      
      {hoveredCell && (
        <div style={{
          position: 'fixed',
          left: `${tooltipPos.x + 10}px`,
          top: `${tooltipPos.y - 10}px`,
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 1000
        }}>
          <strong>Cell:</strong> {hoveredCell.id}<br/>
          <strong>Cluster:</strong> {hoveredCell.cluster}
          {hoveredCell.cellline && <><br/><strong>Cell Line:</strong> {hoveredCell.cellline}</>}
          {hoveredCell.indication && <><br/><strong>Indication:</strong> {hoveredCell.indication}</>}
          {hoveredCell.expression !== undefined && <><br/><strong>Expression:</strong> {hoveredCell.expression.toFixed(3)}</>}
        </div>
      )}
      
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
      
      <div style={{display: 'flex', gap: '2rem'}}>
        {activeView === 'umap' && (
          <div style={{width: '300px', flexShrink: 0}}>
            <div style={{background: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem'}}>
              <h3 style={{fontWeight: '600', marginBottom: '0.5rem'}}>Dataset Information</h3>
              <p><strong>Cells:</strong> {data.cells.length.toLocaleString()}</p>
              <p><strong>Clusters:</strong> {new Set(data.cells.map(c => c.cluster)).size}</p>
              <p><strong>Total genes:</strong> {data.genes.length.toLocaleString()}</p>
              <p><strong>Expressed genes:</strong> {expressedGenes.length.toLocaleString()}</p>
            </div>
            
            <div style={{background: 'white', border: '1px solid #e5e7eb', padding: '1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem'}}>
              <h2 style={{fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem'}}>Gene Selection</h2>
              
              <div style={{marginBottom: '1rem'}}>
                <label style={{display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem'}}>
                  Selected genes ({selectedGenes.length}/5):
                </label>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                  {selectedGenes.map(gene => (
                    <span key={gene} style={{background: '#3b82f6', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                      {gene}
                      <button
                        onClick={() => removeGene(gene)}
                        style={{background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.25rem', padding: 0, lineHeight: 1}}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              
              {selectedGenes.length < 5 && (
                <div style={{position: 'relative'}}>
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
                    style={{width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem'}}
                  />
                  
                  {showDropdown && geneInput && filteredGenes.length > 0 && (
                    <div style={{position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #d1d5db', borderRadius: '0.375rem', marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 10}}>
                      {filteredGenes.map(gene => (
                        <div
                          key={gene}
                          onClick={() => addGene(gene)}
                          style={{padding: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #f3f4f6'}}
                          onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.target.style.background = 'white'}
                        >
                          {gene}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {showDropdown && geneInput && filteredGenes.length === 0 && (
                    <div style={{position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #d1d5db', borderRadius: '0.375rem', marginTop: '0.25rem', zIndex: 10}}>
                      <div style={{padding: '0.5rem', color: '#6b7280', fontSize: '0.875rem'}}>
                        No expressed genes found
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div style={{background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.875rem'}}>
              💡 Only genes with expression data are available for selection. Hover over points to see cell details.
            </div>
          </div>
        )}
        
        {activeView === 'boxplot' && (
          <div style={{width: '300px', flexShrink: 0}}>
            <div style={{background: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem'}}>
              <h3 style={{fontWeight: '600', marginBottom: '0.5rem'}}>Dataset Information</h3>
              <p><strong>Cells:</strong> {data.cells.length.toLocaleString()}</p>
              <p><strong>Indications:</strong> {availableIndications.length}</p>
              <p><strong>Cell Lines:</strong> {availableCellLines.length}</p>
              <p><strong>Expressed genes:</strong> {expressedGenes.length.toLocaleString()}</p>
            </div>
            
            <div style={{background: 'white', border: '1px solid #e5e7eb', padding: '1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem'}}>
              <h2 style={{fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem'}}>Boxplot Settings</h2>
              
              <div style={{marginBottom: '1.5rem'}}>
                <label style={{display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem'}}>Select Gene:</label>
                <select
                  value={boxplotGene}
                  onChange={(e) => setBoxplotGene(e.target.value)}
                  style={{width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer'}}
                >
                  {expressedGenes.map(gene => (
                    <option key={gene} value={gene}>{gene}</option>
                  ))}
                </select>
              </div>
              
              <div style={{marginBottom: '1.5rem'}}>
                <label style={{display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem'}}>Group By:</label>
                <select
                  value={boxplotGroupBy}
                  onChange={(e) => setBoxplotGroupBy(e.target.value)}
                  style={{width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer'}}
                >
                  <option value="indication">Indication</option>
                  <option value="cellline">Cell Line</option>
                </select>
              </div>
              
              {boxplotGroupBy === 'cellline' && (
                <div style={{marginBottom: '1.5rem'}}>
                  <label style={{display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem'}}>Filter by Indication:</label>
                  <select
                    value={selectedIndication}
                    onChange={(e) => setSelectedIndication(e.target.value)}
                    style={{width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer'}}
                  >
                    <option value="all">All Indications</option>
                    {availableIndications.map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            <div style={{background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.875rem'}}>
              📊 Boxplot shows log2(expression + 1) values. Black dots represent individual cells with jitter for visibility.
            </div>
          </div>
        )}
        
        <div style={{flex: 1}}>
          {activeView === 'umap' && (
            <>
              <div style={{marginBottom: '2rem', position: 'relative'}}>
                <div ref={clusterCanvasRef} style={{position: 'relative'}}></div>
              </div>
              
              {selectedGenes.length > 0 && (
                <div>
                  <h2 style={{fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem'}}>Gene Expression UMAP</h2>
                  {selectedGenes.map((gene, idx) => (
                    <div key={gene} style={{marginBottom: '2rem', position: 'relative'}}>
                      {data.expressionData[gene] ? (
                        <div ref={el => geneCanvasRefs.current[idx] = el} style={{position: 'relative'}}></div>
                      ) : (
                        <div style={{textAlign: 'center', padding: '3rem', color: '#6b7280'}}>
                          <p style={{fontSize: '1.125rem'}}>Expression data not available for {gene}</p>
                          <p style={{fontSize: '0.875rem', marginTop: '0.5rem'}}>This gene may not be in the exported dataset</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {selectedGenes.length === 0 && (
                <div style={{textAlign: 'center', padding: '3rem', color: '#6b7280'}}>
                  <h3 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>No genes selected</h3>
                  <p>Select genes from the sidebar to visualize their expression.</p>
                </div>
              )}
            </>
          )}
          
          {activeView === 'boxplot' && (
            <div style={{position: 'relative'}}>
              {boxplotLoading ? (
                <div style={{textAlign: 'center', padding: '3rem', color: '#6b7280'}}>
                  <h3 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>Loading boxplot...</h3>
                  <p>Please wait</p>
                </div>
              ) : boxplotGene && data.expressionData[boxplotGene] ? (
                <div ref={boxplotRef}></div>
              ) : (
                <div style={{textAlign: 'center', padding: '3rem', color: '#6b7280'}}>
                  <h3 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>No data available</h3>
                  <p>Please select a gene with expression data</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScRNASeqViewer;