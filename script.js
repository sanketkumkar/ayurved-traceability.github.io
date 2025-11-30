
// script.js - handles lookup, rendering, map, QR scanning, and admin charts
let sampleData = null;
let map = null;
let markers = [];

async function loadSample() {
  if (sampleData) return sampleData;
  try {
    const res = await fetch('assets/provenance_full.json');
    sampleData = await res.json();
    return sampleData;
  } catch (e) {
    console.error('failed load sample', e);
    return null;
  }
}

function renderProvenance(bundle) {
  const root = document.getElementById('result');
  root.hidden = false; root.innerHTML = '';
  const title = document.createElement('h3'); title.textContent = 'Provenance — ' + (bundle.id||''); root.appendChild(title);
  bundle.events.forEach(ev => {
    const box = document.createElement('div'); box.className='event';
    const h = document.createElement('h4'); h.textContent = ev.resourceType + ' — ' + (ev.id || '');
    box.appendChild(h);
    const p = document.createElement('p'); p.className='small';
    if (ev.resourceType==='CollectionEvent') {
      p.innerHTML = `<strong>Species:</strong> ${ev.species} · <strong>Collector:</strong> ${ev.collectorId} · <strong>When:</strong> ${ev.timestamp}`;
      box.appendChild(p);
      const loc = document.createElement('div'); loc.className='small'; loc.textContent='Location: '+(ev.location?ev.location.lat+','+ev.location.lon:'n/a'); box.appendChild(loc);
      // show on map
      if (ev.location) addMapMarker(ev.location.lat, ev.location.lon, `Collected: ${ev.id}`);
    } else if (ev.resourceType==='QualityTest') {
      p.innerHTML = `<strong>Lab:</strong> ${ev.labId} · <strong>When:</strong> ${ev.timestamp}`;
      const pre = document.createElement('pre'); pre.className='small'; pre.textContent=JSON.stringify(ev.tests,null,2);
      box.appendChild(p); box.appendChild(pre);
    } else if (ev.resourceType==='ProcessingStep') {
      p.innerHTML = `<strong>Facility:</strong> ${ev.facilityId} · <strong>Step:</strong> ${ev.stepType} · <strong>When:</strong> ${ev.timestamp}`;
      box.appendChild(p);
    } else {
      p.textContent = JSON.stringify(ev,null,2); box.appendChild(p);
    }
    root.appendChild(box);
  });
}

function showError(msg){ const err=document.getElementById('error'); err.hidden=false; err.innerHTML=msg; const r=document.getElementById('result'); if(r) r.hidden=true; }

function hideError(){ const err=document.getElementById('error'); if(err){ err.hidden=true; err.textContent=''; } }

document.addEventListener('DOMContentLoaded', async ()=>{
  const data = await loadSample();

  // Lookup
  const lookupBtn = document.getElementById('lookupBtn');
  const serialInput = document.getElementById('serialInput');
  if (lookupBtn && serialInput) {
    lookupBtn.addEventListener('click', ()=>{
      hideError();
      const s = serialInput.value.trim();
      if (!s) { showError('Please enter a serial'); return; }
      if (data && data.provenance && data.provenance.id && (s === data.provenance.target.id || s === data.provenance.id || s==='PROD-001')) {
        // clear map markers first
        clearMarkers();
        renderProvenance(data.provenance);
        // show map
        document.getElementById('map').hidden = false;
        initMapIfNeeded();
      } else {
        showError('Serial not found in demo. Try PROD-001 or scan QR.');
      }
    });
  }

  // Admin charts
  if (document.getElementById('batchChart')) {
    try {
      const ctx = document.getElementById('batchChart').getContext('2d');
      const qc = document.getElementById('qualityChart').getContext('2d');
      // demo data
      const batchChart = new Chart(ctx, {type:'bar', data:{labels:['Jan','Feb','Mar','Apr'], datasets:[{label:'Batches',data:[5,8,7,4]}]}});
      const qualityChart = new Chart(qc, {type:'pie', data:{labels:['A','B','C'], datasets:[{data:[12,4,2]}]}});
    } catch(e){ console.error(e); }
  }

  // QR scanner
  const scanBtn = document.getElementById('scanBtn');
  const scanner = document.getElementById('scanner');
  const video = document.getElementById('video');
  const canvas = document.getElementById('qr-canvas');
  const closeScanner = document.getElementById('closeScanner');
  let stream = null;
  let scanning = false;
  if (scanBtn) {
    scanBtn.addEventListener('click', async ()=>{
      hideError();
      scanner.hidden = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
        video.srcObject = stream;
        video.play();
        scanning = true;
        const ctx = canvas.getContext('2d');
        const tick = ()=>{
          if(!scanning) return;
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          try {
            const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
              // found QR code
              scanning = false;
              if (stream) { stream.getTracks().forEach(t=>t.stop()); }
              scanner.hidden = true;
              // Use code.data as serial
              serialInput.value = code.data;
              document.getElementById('lookupBtn').click();
              return;
            }
          } catch(e){ /* ignore cross-origin issues in some browsers */ }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch(err){ showError('Camera access denied or not available.'); scanner.hidden=true; if(stream) stream.getTracks().forEach(t=>t.stop()); }
    });
  }
  if (closeScanner) {
    closeScanner.addEventListener('click', ()=>{ scanner.hidden=true; if(stream) stream.getTracks().forEach(t=>t.stop()); scanning=false; });
  }
});

// Map helpers (Leaflet)
function initMapIfNeeded(){
  if (map) return;
  try {
    map = L.map('map').setView([22.5726,88.3639],6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
  } catch(e){ console.warn('leaflet not available', e); document.getElementById('map').hidden=true; }
}

function addMapMarker(lat,lon,txt){
  if(!map) initMapIfNeeded();
  if(!map) return;
  const m = L.marker([lat,lon]).addTo(map).bindPopup(txt);
  markers.push(m);
  if (markers.length===1) map.setView([lat,lon],10);
}

function clearMarkers(){ markers.forEach(m=>map.removeLayer(m)); markers=[]; }
