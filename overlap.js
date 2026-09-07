function layoutEvents(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start);
  
  const columns = [];
  const layouts = {};
  
  let lastEventEnd = 0;
  
  for (const evt of sorted) {
    const start = evt.start;
    const end = evt.end;
    
    if (start >= lastEventEnd) {
      columns.forEach(col => {
        col.forEach(e => {
          if (layouts[e.id]) {
            layouts[e.id].totalCols = columns.length;
          }
        });
      });
      columns.length = 0;
    }
    
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const lastEventInCol = col[col.length - 1];
      const lastEnd = lastEventInCol.end;
      
      if (lastEnd <= start) {
        col.push(evt);
        layouts[evt.id] = { col: i, totalCols: columns.length };
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      layouts[evt.id] = { col: columns.length, totalCols: columns.length + 1 };
      columns.push([evt]);
    }
    
    if (end > lastEventEnd) {
      lastEventEnd = end;
    }
  }
  
  columns.forEach(col => {
    col.forEach(e => {
      if (layouts[e.id]) {
        layouts[e.id].totalCols = columns.length;
      }
    });
  });
  
  return layouts;
}

const events = [
  { id: 1, start: 0, end: 100 },
  { id: 2, start: 10, end: 20 },
  { id: 3, start: 30, end: 40 },
  { id: 4, start: 120, end: 150 },
];
console.log(layoutEvents(events));
