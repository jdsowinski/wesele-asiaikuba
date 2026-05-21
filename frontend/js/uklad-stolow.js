// uklad-stolow.js
window.addEventListener('DOMContentLoaded', async () => {
  const svg = document.getElementById('ukladSvg');
  svg.setAttribute('width', '1200');
  svg.setAttribute('height', '700');
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
  let tables = [];
  try {
    const res = await fetch('/prod/api/seating');
    const data = await res.json();
    if (data && Array.isArray(data.tables)) tables = data.tables;
  } catch {}
  svg.innerHTML = '';
  tables.forEach(table => {
    let el;
    if (table.type === 'rect') {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      el.setAttribute('x', table.x);
      el.setAttribute('y', table.y);
      el.setAttribute('width', table.width);
      el.setAttribute('height', table.height);
      el.setAttribute('rx', 10);
      el.setAttribute('fill', '#fff');
      el.setAttribute('stroke', '#b48b5a');
      el.setAttribute('stroke-width', 2);
    } else {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      el.setAttribute('cx', table.x + table.radius);
      el.setAttribute('cy', table.y + table.radius);
      el.setAttribute('rx', table.radius);
      el.setAttribute('ry', table.radius);
      el.setAttribute('fill', '#fff');
      el.setAttribute('stroke', '#b48b5a');
      el.setAttribute('stroke-width', 2);
    }
    svg.appendChild(el);
    // Table name above shape
    const cx = table.type === 'rect' ? table.x + table.width / 2 : table.x + table.radius;
    const topY = table.type === 'rect' ? table.y : table.y;
    const nameLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    nameLabel.setAttribute('x', cx);
    nameLabel.setAttribute('y', topY - 5);
    nameLabel.setAttribute('text-anchor', 'middle');
    nameLabel.setAttribute('font-size', '12');
    nameLabel.setAttribute('font-weight', 'bold');
    nameLabel.setAttribute('fill', '#6b4c30');
    nameLabel.textContent = table.name || table.label || `Stół ${table.id}`;
    svg.appendChild(nameLabel);
    // Seat count inside shape
    const seatCount = Array.isArray(table.seats) ? table.seats.length : (Number(table.seats) || 0);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', table.type === 'rect' ? table.x + table.width/2 : table.x + table.radius);
    label.setAttribute('y', table.type === 'rect' ? table.y + table.height/2 + 6 : table.y + table.radius + 6);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '18');
    label.setAttribute('fill', '#b48b5a');
    label.textContent = seatCount + ' miejsc';
    svg.appendChild(label);
  });
});
