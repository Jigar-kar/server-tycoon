// Removed ES Modules to support direct local file opening (file://) without CORS errors

// Setup Scene
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); 

// Editor grid
scene.add(new THREE.GridHelper(300, 30, 0x555555, 0xeeeeee));

// Calculate dimensions robustly immediately
let w = viewport.clientWidth > 0 ? viewport.clientWidth : window.innerWidth - 500;
let h = viewport.clientHeight > 0 ? viewport.clientHeight : window.innerHeight - 50;

const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
camera.position.set(0, 100, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
viewport.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(20, 50, 20);
scene.add(light);
scene.add(new THREE.AmbientLight(0x666666));

// Controls (using global THREE scope)
const orbit = new THREE.OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transformControl = new THREE.TransformControls(camera, renderer.domElement);
transformControl.addEventListener('dragging-changed', function (event) {
    orbit.enabled = !event.value;
});
transformControl.setTranslationSnap(5);
transformControl.setScaleSnap(1);
scene.add(transformControl);

document.getElementById('snap-toggle').addEventListener('change', (e) => {
    if (e.target.checked) {
        transformControl.setTranslationSnap(5);
        transformControl.setScaleSnap(1);
        transformControl.setRotationSnap(THREE.MathUtils.degToRad(15));
    } else {
        transformControl.setTranslationSnap(null);
        transformControl.setScaleSnap(null);
        transformControl.setRotationSnap(null);
    }
});

// Transform Mode Switching
const btnTrans = document.getElementById('btn-mode-translate');
const btnRot = document.getElementById('btn-mode-rotate');
const btnScale = document.getElementById('btn-mode-scale');

function setMode(mode) {
    transformControl.setMode(mode);
    btnTrans.style.background = mode === 'translate' ? '#4caf50' : '#555';
    btnRot.style.background = mode === 'rotate' ? '#4caf50' : '#555';
    btnScale.style.background = mode === 'scale' ? '#4caf50' : '#555';
}

btnTrans.addEventListener('click', () => setMode('translate'));
btnRot.addEventListener('click', () => setMode('rotate'));
btnScale.addEventListener('click', () => setMode('scale'));

// Keyboard Hotkeys
window.addEventListener('keydown', function (event) {
    if (event.target.tagName === 'INPUT') return; // Ignore if typing in panel
    switch (event.key.toLowerCase()) {
        case 't': setMode('translate'); break;
        case 'r': setMode('rotate'); break;
        case 's': setMode('scale'); break;
        case 'delete':
        case 'backspace':
            if (selectedObj) {
                scene.remove(selectedObj);
                objects = objects.filter(o => o !== selectedObj);
                deselect();
            }
            break;
    }
});

let objects = [];
let selectedObj = null;

// Raycaster for Selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

viewport.addEventListener('mousedown', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
        if(!transformControl.dragging) {
            selectObject(intersects[0].object);
        }
    } else {
        if(!transformControl.dragging) deselect();
    }
});

// UI Elements
const propPanel = document.getElementById('prop-panel');
const btnDelete = document.getElementById('btn-delete');

function updatePropsUI() {
    if(!selectedObj) return;
    document.getElementById('prop-x').value = selectedObj.position.x.toFixed(2);
    document.getElementById('prop-z').value = selectedObj.position.z.toFixed(2);
    
    if(selectedObj.userData.isWall) {
        document.getElementById('prop-sx').value = selectedObj.scale.x.toFixed(2);
        document.getElementById('prop-sz').value = selectedObj.scale.z.toFixed(2);
    }
}

transformControl.addEventListener('change', () => {
    updatePropsUI();
});

function selectObject(obj) {
    selectedObj = obj;
    transformControl.attach(obj);
    
    let html = `
        <div class="prop-group"><label>Type</label><input type="text" disabled value="${obj.userData.type}"></div>
        <div class="prop-group"><label>Position X</label><input type="number" id="prop-x" step="1"></div>
        <div class="prop-group"><label>Position Z</label><input type="number" id="prop-z" step="1"></div>
    `;
    
    if(obj.userData.isWall) {
        html += `
            <div class="prop-group"><label>Scale Width (X)</label><input type="number" id="prop-sx" step="1"></div>
            <div class="prop-group"><label>Scale Depth (Z)</label><input type="number" id="prop-sz" step="1"></div>
        `;
    }
    
    if (obj.userData.type === 'pad') {
        html += `
            <hr style="border:none; border-top:1px solid #444; margin:10px 0;">
            <div class="prop-group"><label>Title Text</label><input type="text" id="prop-title" value="${obj.userData.title || ''}"></div>
            <div class="prop-group"><label>Cost ($)</label><input type="number" id="prop-cost" step="10" value="${obj.userData.cost || 10}"></div>
            <label style="margin-top:10px; display:block; cursor:pointer"><input type="checkbox" id="prop-repeat" ${obj.userData.repeatable ? 'checked' : ''}> Repeatable (Level Up)</label>
        `;
    }
    
    propPanel.innerHTML = html;
    btnDelete.style.display = 'block';
    
    document.getElementById('prop-x').addEventListener('input', e => { obj.position.x = parseFloat(e.target.value)||0; });
    document.getElementById('prop-z').addEventListener('input', e => { obj.position.z = parseFloat(e.target.value)||0; });
    
    if(obj.userData.isWall) {
        document.getElementById('prop-sx').addEventListener('input', e => { obj.scale.x = parseFloat(e.target.value)||1; });
        document.getElementById('prop-sz').addEventListener('input', e => { obj.scale.z = parseFloat(e.target.value)||1; });
    }
    
    if (obj.userData.type === 'pad') {
        document.getElementById('prop-title').addEventListener('input', e => { obj.userData.title = e.target.value; });
        document.getElementById('prop-cost').addEventListener('input', e => { obj.userData.cost = parseInt(e.target.value) || 0; });
        document.getElementById('prop-repeat').addEventListener('change', e => { obj.userData.repeatable = e.target.checked; });
    }

    updatePropsUI();
}

function deselect() {
    selectedObj = null;
    transformControl.detach();
    propPanel.innerHTML = '<p>Select an object to edit.</p>';
    btnDelete.style.display = 'none';
}

btnDelete.addEventListener('click', () => {
    if(selectedObj) {
        scene.remove(selectedObj);
        objects = objects.filter(o => o !== selectedObj);
        deselect();
    }
});

// Spawning Models
document.querySelectorAll('.btn-spawn').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        let mesh;
        if(type === 'server') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(9, 14, 7), new THREE.MeshLambertMaterial({color: 0xF5F5F5}));
            mesh.position.y = 7;
            mesh.userData = { type: 'server', isWall: false };
        } else if(type === 'wall') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), new THREE.MeshLambertMaterial({color: 0x90A4AE}));
            mesh.position.y = 2;
            mesh.userData = { type: 'wall', isWall: true };
        } else if(type === 'pad') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 8), new THREE.MeshLambertMaterial({color: 0xFFC107}));
            mesh.position.y = 0.25;
            mesh.userData = { type: 'pad', isWall: false, title: 'NEW DEV ZONE', cost: 100, repeatable: false };
        } else if(type === 'floor') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 10), new THREE.MeshLambertMaterial({color: 0xE0E0E0}));
            mesh.position.y = 0.25;
            mesh.userData = { type: 'floor', isWall: true };
        } else if(type === 'tree') {
            mesh = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2), new THREE.MeshLambertMaterial({color: 0x5D4037}));
            trunk.position.y = 1;
            const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshLambertMaterial({color: 0x2E7D32}));
            leaves.position.y = 3.5;
            mesh.add(trunk);
            mesh.add(leaves);
            mesh.userData = { type: 'tree', isWall: false };
        } else if(type === 'glass') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), new THREE.MeshLambertMaterial({color: 0x81D4FA, transparent: true, opacity: 0.5}));
            mesh.position.y = 2;
            mesh.userData = { type: 'glass', isWall: true };
        } else if(type === 'carpet') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 10), new THREE.MeshLambertMaterial({color: 0xC62828}));
            mesh.position.y = 0.05;
            mesh.userData = { type: 'carpet', isWall: true };
        }
        
        scene.add(mesh);
        objects.push(mesh);
        selectObject(mesh);
    });
});

document.getElementById('btn-export').addEventListener('click', () => {
    const data = objects.map(o => ({
        type: o.userData.type,
        x: Number(o.position.x.toFixed(2)),
        z: Number(o.position.z.toFixed(2)),
        rotationY: Number(o.rotation.y.toFixed(2)),
        scaleX: Number(o.scale.x.toFixed(2)),
        scaleZ: Number(o.scale.z.toFixed(2)),
        ...(o.userData.type === 'pad' ? { title: o.userData.title, cost: o.userData.cost, repeatable: o.userData.repeatable } : {})
    }));
    localStorage.setItem('tycoonMap', JSON.stringify(data));
    alert('SUCCESS: Environment layout saved seamlessly!\nGo to the main Game tab and refresh the page to instantly see your custom levels.');
});

// Import Export Handlers
document.getElementById('btn-export-file').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem('tycoonMap') || "[]");
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "server_factory_layout.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
});

document.getElementById('btn-import').addEventListener('click', () => {
    let raw = prompt("Paste your raw server JSON layout here:");
    if (!raw) return;
    try {
        JSON.parse(raw); // Validate JSON
        localStorage.setItem('tycoonMap', raw);
        location.reload();
    } catch(e) {
        alert("Invalid JSON format sequence!");
    }
});

document.getElementById('btn-clear-save').addEventListener('click', () => {
    if(confirm("CRITICAL WARNING: This completely wipes your Custom Map overrides AND your Player progress saves globally!\n\nAre you sure you want to hard reset the game engine data?")) {
        localStorage.clear();
        alert("Engine wiped flawlessly. Refresh all play tabs.");
        location.reload();
    }
});

// Load existing layout
window.addEventListener('load', () => {
    let saved = localStorage.getItem('tycoonMap');
    if(saved) {
        let pars = JSON.parse(saved);
        pars.forEach(d => {
            let mesh;
            if(d.type === 'server') {
                mesh = new THREE.Mesh(new THREE.BoxGeometry(9, 14, 7), new THREE.MeshLambertMaterial({color: 0xF5F5F5}));
                mesh.position.set(d.x, 7, d.z);
                mesh.userData = { type: 'server', isWall: false };
            } else if(d.type === 'wall') {
                mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), new THREE.MeshLambertMaterial({color: 0x90A4AE}));
                mesh.position.set(d.x, 2, d.z);
                mesh.scale.set(d.scaleX, 1, d.scaleZ);
                mesh.userData = { type: 'wall', isWall: true };
            } else if(d.type === 'pad') {
                mesh = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 8), new THREE.MeshLambertMaterial({color: 0xFFC107}));
                mesh.position.set(d.x, 0.25, d.z);
                mesh.userData = { type: 'pad', isWall: false, title: d.title || 'NEW DEV ZONE', cost: d.cost || 100, repeatable: !!d.repeatable };
            } else if(d.type === 'floor') {
                mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 10), new THREE.MeshLambertMaterial({color: 0xE0E0E0}));
                mesh.position.set(d.x, 0.25, d.z);
                mesh.scale.set(d.scaleX, 1, d.scaleZ);
                mesh.userData = { type: 'floor', isWall: true };
            } else if(d.type === 'tree') {
                mesh = new THREE.Group();
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2), new THREE.MeshLambertMaterial({color: 0x5D4037}));
                trunk.position.y = 1;
                const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshLambertMaterial({color: 0x2E7D32}));
                leaves.position.y = 3.5;
                mesh.add(trunk);
                mesh.add(leaves);
                mesh.position.set(d.x, 0, d.z);
                mesh.userData = { type: 'tree', isWall: false };
            } else if(d.type === 'glass') {
                mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), new THREE.MeshLambertMaterial({color: 0x81D4FA, transparent: true, opacity: 0.5}));
                mesh.position.set(d.x, 2, d.z);
                mesh.scale.set(d.scaleX, 1, d.scaleZ);
                mesh.userData = { type: 'glass', isWall: true };
            } else if(d.type === 'carpet') {
                mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 10), new THREE.MeshLambertMaterial({color: 0xC62828}));
                mesh.position.set(d.x, 0.05, d.z);
                mesh.scale.set(d.scaleX, 1, d.scaleZ);
                mesh.userData = { type: 'carpet', isWall: true };
            }
            if (d.rotationY) mesh.rotation.y = d.rotationY;
            scene.add(mesh);
            objects.push(mesh);
        });
    }
});

// Resize
window.addEventListener('resize', () => {
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    orbit.update();
    renderer.render(scene, camera);
}
animate();
