document.addEventListener('DOMContentLoaded', () => {
    // --- Initial Setup ---
    const canvas = document.getElementById('automata-canvas');
    const svgNS = 'http://www.w3.org/2000/svg';

    // Create layers to ensure states are drawn strictly over edges
    const elementsGroup = document.createElementNS(svgNS, 'g');
    elementsGroup.setAttribute('id', 'pan-group');
    const edgesGroup = document.createElementNS(svgNS, 'g');
    const nodesGroup = document.createElementNS(svgNS, 'g');

    elementsGroup.appendChild(edgesGroup);
    elementsGroup.appendChild(nodesGroup);
    canvas.appendChild(elementsGroup);

    // --- Pan / Zoom State ---
    let panX = 0, panY = 0;
    let zoom = 1;
    const ZOOM_MIN = 0.2, ZOOM_MAX = 5;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;

    // --- UI State & Tools ---
    const tools = {
        select: document.getElementById('tool-select'),
        state: document.getElementById('tool-state'),
        transition: document.getElementById('tool-transition'),
    };

    const contextMenus = {
        state: document.getElementById('state-context-menu'),
        transition: document.getElementById('transition-context-menu')
    };

    let currentMode = 'select';
    const STATE_RADIUS = 25;

    // Application Data structure
    const appState = {
        nodes: [], // { id, label, x, y, isStart, isAccept }
        edges: [], // { id, from, to, symbols: [], cpX?, cpY? }
        selectedNodeId: null,
        selectedEdgeId: null,
        nodeCounter: 0,
        edgeCounter: 0,

        // Interaction states
        dragNodeId: null,
        dragOffsetX: 0,
        dragOffsetY: 0,

        isDrawingEdge: false,
        tempEdgeSourceId: null,
        drawingPoints: [],   // freehand points collected during transition drawing
        mouseX: 0,
        mouseY: 0,
    };

    // --- UI Initialization ---
    Object.keys(tools).forEach(key => {
        tools[key].addEventListener('click', () => {
            Object.values(tools).forEach(btn => btn.classList.remove('active'));
            tools[key].classList.add('active');
            currentMode = key;

            const msgs = {
                select: 'Select an element to view properties, drag to move nodes.',
                state: 'Click on the canvas to add a new state.',
                transition: 'Click and drag from a state to draw a transition.'
            };
            document.getElementById('status-message').textContent = msgs[currentMode];

            if (currentMode !== 'select') {
                deselectAll();
            }
        });
    });

    document.getElementById('prop-name').addEventListener('input', (e) => {
        if (appState.selectedNodeId) {
            const node = appState.nodes.find(n => n.id === appState.selectedNodeId);
            if (node) {
                node.label = e.target.value || node.id;
                updateRender();
            }
        }
    });

    document.getElementById('prop-start').addEventListener('change', (e) => {
        if (appState.selectedNodeId) {
            const node = appState.nodes.find(n => n.id === appState.selectedNodeId);
            if (node) {
                // Remove start status from others if this is checked (only one start state)
                if (e.target.checked) {
                    appState.nodes.forEach(n => n.isStart = false);
                }
                node.isStart = e.target.checked;
                updateRender();
            }
        }
    });

    document.getElementById('prop-accept').addEventListener('change', (e) => {
        if (appState.selectedNodeId) {
            const node = appState.nodes.find(n => n.id === appState.selectedNodeId);
            if (node) {
                node.isAccept = e.target.checked;
                updateRender();
            }
        }
    });

    document.getElementById('btn-delete-state').addEventListener('click', () => {
        if (appState.selectedNodeId) {
            // Remove node
            appState.nodes = appState.nodes.filter(n => n.id !== appState.selectedNodeId);
            // Remove connected edges
            appState.edges = appState.edges.filter(e => e.from !== appState.selectedNodeId && e.to !== appState.selectedNodeId);
            deselectAll();
        }
    });

    document.getElementById('transition-symbol-input').addEventListener('input', (e) => {
        if (appState.selectedEdgeId) {
            const edge = appState.edges.find(edge => edge.id === appState.selectedEdgeId);
            if (edge) {
                const warningEl = document.getElementById('dfa-warning');
                const symbols = e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                const hasEpsilon = symbols.some(s => s === 'ε' || s === 'epsilon');
                if (hasEpsilon) {
                    warningEl.textContent = '⛔ DFA does not allow ε (epsilon) transitions. Use NFA for that.';
                    warningEl.style.display = 'block';
                    edge.symbols = symbols.filter(s => s !== 'ε' && s !== 'epsilon') || ['?'];
                    updateRender();
                    return;
                }
                const newSymbols = symbols.length > 0 ? symbols : ['?'];

                // DFA validation: check if any of these symbols already have a transition
                // from the same source state on a DIFFERENT edge
                const conflicts = [];
                newSymbols.forEach(sym => {
                    if (sym === 'ε') return; // epsilon is allowed in multiple edges
                    const conflictEdge = appState.edges.find(e =>
                        e.id !== edge.id &&
                        e.from === edge.from &&
                        e.symbols.includes(sym)
                    );
                    if (conflictEdge) {
                        const targetNode = appState.nodes.find(n => n.id === conflictEdge.to);
                        conflicts.push(`'${sym}' → ${targetNode ? targetNode.label : conflictEdge.to}`);
                    }
                });

                if (conflicts.length > 0) {
                    warningEl.textContent = `⚠️ DFA violation! Transition(s) already exist: ${conflicts.join(', ')}. Delete the existing transition or change the symbol.`;
                    warningEl.style.display = 'block';
                    // Still allow the edit but warn — user can fix it
                } else {
                    warningEl.style.display = 'none';
                }

                edge.symbols = newSymbols;
                updateRender();
            }
        }
    });

    document.getElementById('btn-delete-transition').addEventListener('click', () => {
        if (appState.selectedEdgeId) {
            appState.edges = appState.edges.filter(e => e.id !== appState.selectedEdgeId);
            deselectAll();
        }
    });

    // --- Interaction Logic ---
    function deselectAll() {
        appState.selectedNodeId = null;
        appState.selectedEdgeId = null;
        contextMenus.state.style.display = 'none';
        contextMenus.transition.style.display = 'none';
        updateRender();
    }

    function selectNode(id) {
        deselectAll();
        appState.selectedNodeId = id;
        const node = appState.nodes.find(n => n.id === id);
        if (node) {
            contextMenus.state.style.display = 'flex';
            document.getElementById('prop-name').value = node.label;
            document.getElementById('prop-start').checked = node.isStart;
            document.getElementById('prop-accept').checked = node.isAccept;
        }
        updateRender();
    }

    function selectEdge(id) {
        deselectAll();
        appState.selectedEdgeId = id;
        const edge = appState.edges.find(e => e.id === id);
        if (edge) {
            contextMenus.transition.style.display = 'flex';
            document.getElementById('transition-symbol-input').value = edge.symbols.join(', ');
        }
        updateRender();
    }

    // Canvas Events — account for pan and zoom so node positions are in world space
    const getMouseCoords = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - panX) / zoom,
            y: (e.clientY - rect.top - panY) / zoom
        };
    };

    // Raw screen-space coords (for panning)
    const getScreenCoords = (e) => {
        return { sx: e.clientX, sy: e.clientY };
    };

    canvas.addEventListener('mousedown', (e) => {
        const { x, y } = getMouseCoords(e);
        const { sx, sy } = getScreenCoords(e);
        const target = e.target;

        // Middle-mouse or Ctrl+click always pans
        if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
            isPanning = true;
            panStartX = sx - panX;
            panStartY = sy - panY;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        // Find if we clicked on a node or edge
        const nodeGroup = target.closest('.state');
        const edgeGroup = target.closest('.transition');

        if (currentMode === 'select' || currentMode === 'transition') {
            if (nodeGroup) {
                const nodeId = nodeGroup.getAttribute('data-id');
                if (currentMode === 'select') {
                    selectNode(nodeId);
                    appState.dragNodeId = nodeId;
                    const node = appState.nodes.find(n => n.id === nodeId);
                    appState.dragOffsetX = x - node.x;
                    appState.dragOffsetY = y - node.y;
                } else if (currentMode === 'transition') {
                    appState.isDrawingEdge = true;
                    appState.tempEdgeSourceId = nodeId;
                    appState.drawingPoints = [{ x, y }];
                    appState.mouseX = x;
                    appState.mouseY = y;
                    updateRender();
                }
                return;
            } else if (edgeGroup && currentMode === 'select') {
                const edgeId = edgeGroup.getAttribute('data-id');
                selectEdge(edgeId);
                return;
            } else if (currentMode === 'select' && !nodeGroup && !edgeGroup) {
                // Empty canvas click in select mode → start panning
                deselectAll();
                isPanning = true;
                panStartX = sx - panX;
                panStartY = sy - panY;
                canvas.style.cursor = 'grabbing';
                return;
            } else {
                deselectAll();
            }
        }

        if (currentMode === 'state' && !nodeGroup) {
            // Add new state
            appState.nodes.push({
                id: `q${appState.nodeCounter}`,
                label: `q${appState.nodeCounter}`,
                x, y,
                isStart: appState.nodes.length === 0,
                isAccept: false
            });
            appState.nodeCounter++;
            updateRender();
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const { sx, sy } = getScreenCoords(e);

        // Panning takes priority
        if (isPanning) {
            panX = sx - panStartX;
            panY = sy - panStartY;
            applyPanTransform();
            return;
        }

        const { x, y } = getMouseCoords(e);
        appState.mouseX = x;
        appState.mouseY = y;

        if (appState.dragNodeId && currentMode === 'select') {
            const node = appState.nodes.find(n => n.id === appState.dragNodeId);
            if (node) {
                node.x = x - appState.dragOffsetX;
                node.y = y - appState.dragOffsetY;
                updateRender();
            }
        } else if (appState.isDrawingEdge) {
            appState.drawingPoints.push({ x, y });
            updateRender();
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
            return;
        }

        if (appState.dragNodeId) {
            appState.dragNodeId = null;
        }

        if (appState.isDrawingEdge) {
            const target = e.target;
            const nodeGroup = target.closest('.state');

            if (nodeGroup) {
                const targetNodeId = nodeGroup.getAttribute('data-id');
                let existingEdge = appState.edges.find(e => e.from === appState.tempEdgeSourceId && e.to === targetNodeId);
                if (existingEdge) {
                    // Update the control point with the new freehand path
                    const cp = computeControlPoint(appState.tempEdgeSourceId, targetNodeId, appState.drawingPoints);
                    if (cp) { existingEdge.cpX = cp.x; existingEdge.cpY = cp.y; }
                    selectEdge(existingEdge.id);
                } else {
                    const cp = computeControlPoint(appState.tempEdgeSourceId, targetNodeId, appState.drawingPoints);
                    const newEdge = {
                        id: `e${appState.edgeCounter++}`,
                        from: appState.tempEdgeSourceId,
                        to: targetNodeId,
                        symbols: ['?'],
                        cpX: cp ? cp.x : null,
                        cpY: cp ? cp.y : null
                    };
                    appState.edges.push(newEdge);
                    selectEdge(newEdge.id);
                    tools.select.click();
                }
            }

            appState.isDrawingEdge = false;
            appState.tempEdgeSourceId = null;
            appState.drawingPoints = [];
            updateRender();
        }
    });

    // Handle mouse leaving canvas
    canvas.addEventListener('mouseleave', () => {
        appState.dragNodeId = null;
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
        }
        if (appState.isDrawingEdge) {
            appState.isDrawingEdge = false;
            appState.tempEdgeSourceId = null;
            appState.drawingPoints = [];
            updateRender();
        }
    });

    // Prevent default context menu on middle-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Apply the pan + zoom transform to the SVG group
    function applyPanTransform() {
        elementsGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
    }

    // Zoom via mouse wheel — zoom toward cursor position
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        // Mouse position in screen space relative to SVG
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const oldZoom = zoom;
        const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * zoomFactor));

        // Adjust pan so that the point under the cursor stays fixed
        panX = mx - (mx - panX) * (zoom / oldZoom);
        panY = my - (my - panY) * (zoom / oldZoom);

        applyPanTransform();
    }, { passive: false });

    // Compute the smoothed control point from freehand points.
    // Finds the point furthest from the straight line src→tgt and uses it as the bezier control point.
    function computeControlPoint(srcId, tgtId, points) {
        const src = appState.nodes.find(n => n.id === srcId);
        const tgt = appState.nodes.find(n => n.id === tgtId);
        if (!src || !tgt || points.length < 3) return null;

        // Line from src center to tgt center
        const lx = tgt.x - src.x;
        const ly = tgt.y - src.y;
        const len = Math.hypot(lx, ly);
        if (len === 0) return null;

        // Unit normal of the line
        const nx = -ly / len;
        const ny = lx / len;

        // Find the point with the largest signed perpendicular distance (keeping sign to know direction)
        let maxAbsDist = 0;
        let bestPoint = null;
        for (const p of points) {
            const px = p.x - src.x;
            const py = p.y - src.y;
            const signedDist = px * nx + py * ny; // dot with normal
            if (Math.abs(signedDist) > maxAbsDist) {
                maxAbsDist = Math.abs(signedDist);
                bestPoint = p;
            }
        }

        // Only create a control point if the deviation is significant (> 15px)
        if (maxAbsDist < 15) return null;

        // The bezier control point should be ~2x the deviation from midpoint
        // for a quadratic bezier to pass through the furthest point
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;
        const devX = bestPoint.x - midX;
        const devY = bestPoint.y - midY;

        return {
            x: midX + devX * 2,
            y: midY + devY * 2
        };
    }

    // --- Rendering Math & Logic ---
    function updateRender() {
        // Clear all
        nodesGroup.innerHTML = '';
        edgesGroup.innerHTML = '';

        // Pre-compute which node-pairs have bidirectional edges
        const pairKey = (a, b) => [a, b].sort().join('|');
        const pairSet = new Set();
        const biDirPairs = new Set();
        appState.edges.forEach(e => {
            const k = pairKey(e.from, e.to);
            if (pairSet.has(k) || (e.from !== e.to && appState.edges.some(o => o.from === e.to && o.to === e.from))) {
                biDirPairs.add(k);
            }
            pairSet.add(k);
        });

        // Render Edges
        appState.edges.forEach(edge => {
            const sourceInfo = appState.nodes.find(n => n.id === edge.from);
            const targetInfo = appState.nodes.find(n => n.id === edge.to);
            if (!sourceInfo || !targetInfo) return;

            const isSelected = edge.id === appState.selectedEdgeId;
            const isSelfLoop = edge.from === edge.to;
            const g = document.createElementNS(svgNS, 'g');
            g.classList.add('transition');
            if (isSelected) g.classList.add('selected');
            g.setAttribute('data-id', edge.id);

            const path = document.createElementNS(svgNS, 'path');
            path.classList.add('transition-path');

            let textX, textY;

            if (isSelfLoop) {
                const x = sourceInfo.x;
                const y = sourceInfo.y;
                const r = STATE_RADIUS;
                const loopRadius = 30;
                const x1 = x - r * 0.5;
                const y1 = y - r * 0.866;
                const x2 = x + r * 0.5;
                const y2 = y - r * 0.866;

                path.setAttribute('d', `M ${x1} ${y1} C ${x - loopRadius * 1.5} ${y - loopRadius * 3}, ${x + loopRadius * 1.5} ${y - loopRadius * 3}, ${x2} ${y2}`);
                textX = x;
                textY = y - loopRadius * 3.3;
            } else {
                const dx = targetInfo.x - sourceInfo.x;
                const dy = targetInfo.y - sourceInfo.y;
                const distance = Math.hypot(dx, dy);

                if (distance > 0) {
                    const angle = Math.atan2(dy, dx);
                    // Use user-drawn control point if available
                    const hasCustomCP = (edge.cpX != null && edge.cpY != null);

                    if (hasCustomCP) {
                        // Compute angle from source to control point for start attachment
                        const aCPsrc = Math.atan2(edge.cpY - sourceInfo.y, edge.cpX - sourceInfo.x);
                        const aCPtgt = Math.atan2(edge.cpY - targetInfo.y, edge.cpX - targetInfo.x);
                        const startX = sourceInfo.x + Math.cos(aCPsrc) * STATE_RADIUS;
                        const startY = sourceInfo.y + Math.sin(aCPsrc) * STATE_RADIUS;
                        const endX = targetInfo.x + Math.cos(aCPtgt) * STATE_RADIUS;
                        const endY = targetInfo.y + Math.sin(aCPtgt) * STATE_RADIUS;

                        path.setAttribute('d', `M ${startX} ${startY} Q ${edge.cpX} ${edge.cpY} ${endX} ${endY}`);
                        // Place label near control point
                        const labelX = (startX + 2 * edge.cpX + endX) / 4;
                        const labelY = (startY + 2 * edge.cpY + endY) / 4 - 10;
                        textX = labelX;
                        textY = labelY;
                    } else {
                        // Default: straight line (or auto-curve for bidirectional)
                        const isBiDir = biDirPairs.has(pairKey(edge.from, edge.to));
                        if (isBiDir) {
                            const curveSign = (edge.from < edge.to) ? 1 : -1;
                            const CURVE_OFFSET = 50;
                            const nx = -dy / distance;
                            const ny = dx / distance;
                            const midX = (sourceInfo.x + targetInfo.x) / 2;
                            const midY = (sourceInfo.y + targetInfo.y) / 2;
                            const cpX = midX + nx * CURVE_OFFSET * curveSign;
                            const cpY = midY + ny * CURVE_OFFSET * curveSign;
                            const angOff = 0.45 * curveSign;
                            const startX = sourceInfo.x + Math.cos(angle + angOff) * STATE_RADIUS;
                            const startY = sourceInfo.y + Math.sin(angle + angOff) * STATE_RADIUS;
                            const endX = targetInfo.x - Math.cos(angle - angOff) * STATE_RADIUS;
                            const endY = targetInfo.y - Math.sin(angle - angOff) * STATE_RADIUS;
                            path.setAttribute('d', `M ${startX} ${startY} Q ${cpX} ${cpY} ${endX} ${endY}`);
                            textX = cpX + nx * 14 * curveSign;
                            textY = cpY + ny * 14 * curveSign;
                        } else {
                            const startX = sourceInfo.x + Math.cos(angle) * STATE_RADIUS;
                            const startY = sourceInfo.y + Math.sin(angle) * STATE_RADIUS;
                            const endX = targetInfo.x - Math.cos(angle) * STATE_RADIUS;
                            const endY = targetInfo.y - Math.sin(angle) * STATE_RADIUS;
                            path.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
                            textX = (sourceInfo.x + targetInfo.x) / 2;
                            textY = (sourceInfo.y + targetInfo.y) / 2 - 12;
                        }
                    }
                } else {
                    textX = sourceInfo.x; textY = sourceInfo.y;
                }
            }

            // Invisible wide path for easier clicking
            const clickPath = path.cloneNode();
            clickPath.setAttribute('stroke', 'transparent');
            clickPath.setAttribute('stroke-width', '15');
            clickPath.setAttribute('fill', 'none');

            // Text Label
            const textBg = document.createElementNS(svgNS, 'rect');
            const text = document.createElementNS(svgNS, 'text');
            text.classList.add('transition-text');
            text.setAttribute('x', textX);
            text.setAttribute('y', textY);
            text.textContent = edge.symbols.join(', ');

            g.appendChild(path);
            g.appendChild(clickPath);
            g.appendChild(text); // no bg rect yet, can add if it overlaps too much

            edgesGroup.appendChild(g);

            // Dynamically add a background rectangle behind the text for readability
            // Requires attaching text to DOM first to get BBox, will do simple approach instead:
            // Just use text-shadow in CSS, or let text color handle it. I'll rely on text-shadow or a simple rect if needed
            // Let's add simple CSS filter or stroke for text readability if background is busy.
        });

        // Render Temp Edge — show freehand polyline as the user draws
        if (appState.isDrawingEdge && appState.tempEdgeSourceId && appState.drawingPoints.length > 0) {
            const pts = appState.drawingPoints;
            // Build an SVG polyline from all collected points + current mouse
            let pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
            pointsStr += ` ${appState.mouseX},${appState.mouseY}`;

            const polyline = document.createElementNS(svgNS, 'polyline');
            polyline.classList.add('temp-transition');
            polyline.setAttribute('points', pointsStr);
            edgesGroup.appendChild(polyline);
        }

        // Render Nodes
        appState.nodes.forEach(node => {
            const g = document.createElementNS(svgNS, 'g');
            g.classList.add('state');
            if (node.id === appState.selectedNodeId) g.classList.add('selected');
            g.setAttribute('data-id', node.id);
            g.setAttribute('transform', `translate(${node.x}, ${node.y})`);

            // Start State Arrow
            if (node.isStart) {
                const arrow = document.createElementNS(svgNS, 'path');
                arrow.classList.add('state-start-arrow');
                arrow.setAttribute('d', `M -60 0 L ${-STATE_RADIUS - 5} 0`);
                g.appendChild(arrow);
            }

            // Main Circle
            const circle = document.createElementNS(svgNS, 'circle');
            circle.classList.add('state-circle');
            circle.setAttribute('r', STATE_RADIUS);
            g.appendChild(circle);

            // Accept State Inner Circle
            if (node.isAccept) {
                const acceptCircle = document.createElementNS(svgNS, 'circle');
                acceptCircle.classList.add('state-accept-circle');
                acceptCircle.setAttribute('r', STATE_RADIUS - 5);
                g.appendChild(acceptCircle);
            }

            // Label
            const text = document.createElementNS(svgNS, 'text');
            text.classList.add('state-text');
            text.textContent = node.label;
            g.appendChild(text);

            nodesGroup.appendChild(g);
        });

    }

    // --- Simulation Engine ---
    appState.sim = {
        activeStates: [],
        tape: [],
        head: 0,
        status: 'idle', // idle, playing, accepted, rejected
        intervalId: null
    };

    const uiControls = {
        input: document.getElementById('sim-input'),
        btnReset: document.getElementById('btn-reset'),
        btnStep: document.getElementById('btn-step'),
        btnPlay: document.getElementById('btn-play'),
        speedSlider: document.getElementById('speed-slider'),
        tapeContainer: document.getElementById('sim-tape'),
        resultBadge: document.getElementById('sim-result')
    };

    const dfaExamples = {
        'dfa-ends-with-01': {
            title: 'Ends with 01',
            input: '1101',
            nodes: [
                { id: 'q0', label: 'q0', x: 220, y: 220, isStart: true, isAccept: false },
                { id: 'q1', label: 'q1', x: 440, y: 140, isStart: false, isAccept: false },
                { id: 'q2', label: 'q2', x: 440, y: 300, isStart: false, isAccept: true }
            ],
            edges: [
                { id: 'e0', from: 'q0', to: 'q1', symbols: ['0'], cpX: null, cpY: null },
                { id: 'e1', from: 'q0', to: 'q0', symbols: ['1'], cpX: null, cpY: null },
                { id: 'e2', from: 'q1', to: 'q1', symbols: ['0'], cpX: null, cpY: null },
                { id: 'e3', from: 'q1', to: 'q2', symbols: ['1'], cpX: null, cpY: null },
                { id: 'e4', from: 'q2', to: 'q1', symbols: ['0'], cpX: null, cpY: null },
                { id: 'e5', from: 'q2', to: 'q0', symbols: ['1'], cpX: null, cpY: null }
            ]
        },
        'dfa-even-ones': {
            title: 'Even number of 1s',
            input: '1010',
            nodes: [
                { id: 'q0', label: 'q0', x: 260, y: 220, isStart: true, isAccept: true },
                { id: 'q1', label: 'q1', x: 500, y: 220, isStart: false, isAccept: false }
            ],
            edges: [
                { id: 'e0', from: 'q0', to: 'q0', symbols: ['0'], cpX: null, cpY: null },
                { id: 'e1', from: 'q0', to: 'q1', symbols: ['1'], cpX: null, cpY: null },
                { id: 'e2', from: 'q1', to: 'q1', symbols: ['0'], cpX: null, cpY: null },
                { id: 'e3', from: 'q1', to: 'q0', symbols: ['1'], cpX: null, cpY: null }
            ]
        }
    };

    function nextCounter(items, prefix) {
        let max = -1;
        items.forEach(item => {
            const raw = String(item.id || '');
            const num = parseInt(raw.replace(prefix, ''), 10);
            if (Number.isFinite(num)) max = Math.max(max, num);
        });
        return max + 1;
    }

    function loadDfaExample(exampleId) {
        const example = dfaExamples[exampleId];
        if (!example) return;

        saveSnapshot();
        appState.nodes = JSON.parse(JSON.stringify(example.nodes));
        appState.edges = JSON.parse(JSON.stringify(example.edges));
        appState.nodeCounter = nextCounter(appState.nodes, 'q');
        appState.edgeCounter = nextCounter(appState.edges, 'e');
        uiControls.input.value = example.input;

        deselectAll();
        resetSim();
        document.getElementById('status-message').textContent = `Loaded example: ${example.title}`;
    }

    function getEpsilonClosure(stateIds) {
        const closure = new Set(stateIds);
        const stack = [...stateIds];

        while (stack.length > 0) {
            const currentId = stack.pop();
            // find outgoing epsilon transitions
            appState.edges.filter(e => e.from === currentId && e.symbols.includes('ε')).forEach(e => {
                if (!closure.has(e.to)) {
                    closure.add(e.to);
                    stack.push(e.to);
                }
            });
        }
        return Array.from(closure);
    }

    function buildInputTape(rawInput) {
        const normalized = (rawInput || '').trim();
        if (!normalized) return [];

        // Accept common epsilon notations as empty string input.
        const epsilonTokens = new Set(['ε', 'epsilon', 'lambda', 'λ', 'empty']);
        if (epsilonTokens.has(normalized.toLowerCase())) {
            return [];
        }

        return normalized.split('');
    }

    function resetSim() {
        clearTimeout(appState.sim.intervalId);
        appState.sim.tape = buildInputTape(uiControls.input.value);
        appState.sim.head = 0;
        appState.sim.status = 'idle';
        uiControls.btnPlay.textContent = '▶️ Play';

        // Render tape
        uiControls.tapeContainer.innerHTML = '';
        appState.sim.tape.forEach((char, idx) => {
            const cell = document.createElement('div');
            cell.className = 'tape-cell';
            cell.textContent = char;
            uiControls.tapeContainer.appendChild(cell);
        });

        uiControls.resultBadge.className = 'result-badge';
        uiControls.resultBadge.textContent = '';

        // start states
        const startNodes = appState.nodes.filter(n => n.isStart).map(n => n.id);
        if (startNodes.length === 0) {
            appState.sim.activeStates = [];
        } else {
            appState.sim.activeStates = getEpsilonClosure(startNodes);
        }

        updateRender(); // will render active states 
        document.querySelectorAll('g.transition.active-edge-sim').forEach(el => el.classList.remove('active-edge-sim'));

        // Empty input is accepted iff an accepting state is reachable at start.
        if (appState.sim.tape.length === 0) {
            checkAcceptance();
        }
    }

    function stepSim() {
        if (appState.sim.status === 'accepted' || appState.sim.status === 'rejected') return false;
        if (appState.sim.activeStates.length === 0) {
            autoReject();
            return false;
        }

        if (appState.sim.head >= appState.sim.tape.length) {
            // End of input, check acceptance
            checkAcceptance();
            return false;
        }

        const symbol = appState.sim.tape[appState.sim.head];

        // calculate next states
        let nextStates = new Set();
        let usedTransitions = new Set();

        appState.sim.activeStates.forEach(stateId => {
            appState.edges.forEach(edge => {
                if (edge.from === stateId && edge.symbols.includes(symbol)) {
                    nextStates.add(edge.to);
                    usedTransitions.add(edge.id);
                }
            });
        });

        appState.sim.activeStates = getEpsilonClosure(Array.from(nextStates));

        // Clear previously highlighted edges
        document.querySelectorAll('g.transition.active-edge-sim').forEach(el => el.classList.remove('active-edge-sim'));

        // Mark transitioned edges as active
        usedTransitions.forEach(eId => {
            const g = document.querySelector(`g.transition[data-id="${eId}"]`);
            if (g) g.classList.add('active-edge-sim');
        });

        // update tape UI
        const cells = uiControls.tapeContainer.children;
        if (cells[appState.sim.head]) {
            cells[appState.sim.head].classList.remove('active');
            cells[appState.sim.head].classList.add('consumed');
        }

        appState.sim.head++;

        if (cells[appState.sim.head]) {
            cells[appState.sim.head].classList.add('active');
        }

        updateRender();

        // Re-evaluate immediately if consumed fully
        if (appState.sim.head >= appState.sim.tape.length) {
            checkAcceptance();
            return false;
        }

        return true;
    }

    function checkAcceptance() {
        // For empty input, always derive active states from current automaton state
        // so acceptance stays correct after editing start/accept flags.
        if (appState.sim.head === 0 && appState.sim.tape.length === 0) {
            const startNodes = appState.nodes.filter(n => n.isStart).map(n => n.id);
            appState.sim.activeStates = startNodes.length > 0
                ? getEpsilonClosure(startNodes)
                : [];
        }

        const hasAccepting = appState.sim.activeStates.some(id => {
            const node = appState.nodes.find(n => n.id === id);
            return node && node.isAccept;
        });

        if (hasAccepting) {
            appState.sim.status = 'accepted';
            uiControls.resultBadge.className = 'result-badge accepted';
            uiControls.resultBadge.textContent = 'Accepted';
        } else {
            appState.sim.status = 'rejected';
            uiControls.resultBadge.className = 'result-badge rejected';
            uiControls.resultBadge.textContent = 'Rejected';
        }
        uiControls.btnPlay.textContent = '▶️ Play';
    }

    function autoReject() {
        appState.sim.status = 'rejected';
        uiControls.resultBadge.className = 'result-badge rejected';
        uiControls.resultBadge.textContent = 'Rejected - Stuck';
        uiControls.btnPlay.textContent = '▶️ Play';
    }

    uiControls.btnReset.addEventListener('click', resetSim);
    uiControls.btnStep.addEventListener('click', () => { stepSim(); });

    uiControls.input.addEventListener('input', resetSim);

    uiControls.btnPlay.addEventListener('click', () => {
        if (appState.sim.status === 'playing') {
            // Pause
            clearTimeout(appState.sim.intervalId);
            appState.sim.status = 'idle';
            uiControls.btnPlay.textContent = '▶️ Play';
        } else {
            // Play
            if (appState.sim.status === 'idle') {
                if (appState.sim.head >= appState.sim.tape.length && appState.sim.tape.length > 0) {
                    resetSim(); // loop back if at end
                }
            } else if (appState.sim.status === 'accepted' || appState.sim.status === 'rejected') {
                resetSim();
            }

            // Evaluate empty string immediately (no playback loop needed).
            if (appState.sim.tape.length === 0) {
                checkAcceptance();
                return;
            }

            appState.sim.status = 'playing';
            uiControls.btnPlay.textContent = '⏸️ Pause';

            const playStep = () => {
                if (appState.sim.status !== 'playing') return;

                const hasMore = stepSim();
                if (hasMore) {
                    // value is 100-2000, invert to get ms (fast = small delay)
                    const speed = 2100 - parseInt(uiControls.speedSlider.value);
                    appState.sim.intervalId = setTimeout(playStep, speed);
                } else {
                    appState.sim.status = 'idle';
                }
            };

            // initial active tape cell
            const cells = uiControls.tapeContainer.children;
            if (cells[appState.sim.head]) {
                cells[appState.sim.head].classList.add('active');
            }

            const initialSpeed = 2100 - parseInt(uiControls.speedSlider.value);
            appState.sim.intervalId = setTimeout(playStep, initialSpeed);
        }
    });

    document.querySelectorAll('.example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            loadDfaExample(btn.getAttribute('data-example-id'));
        });
    });

    // Patch updateRender to handle active visual states
    const originalUpdateRender = updateRender;
    updateRender = function () {
        originalUpdateRender();

        // Highlight active states
        if (appState.sim && appState.sim.activeStates) {
            appState.sim.activeStates.forEach(id => {
                const g = document.querySelector(`g.state[data-id="${id}"]`);
                if (g) g.classList.add('active-sim');
            });
        }
    };

    // ================================================================
    // FEATURE 1: UNDO / REDO
    // ================================================================
    appState.undoStack = [];
    appState.redoStack = [];

    function saveSnapshot() {
        const snapshot = {
            nodes: JSON.parse(JSON.stringify(appState.nodes)),
            edges: JSON.parse(JSON.stringify(appState.edges)),
            nodeCounter: appState.nodeCounter,
            edgeCounter: appState.edgeCounter
        };
        appState.undoStack.push(snapshot);
        // Cap history at 50 entries to avoid memory bloat
        if (appState.undoStack.length > 50) appState.undoStack.shift();
        // Any new action clears redo history
        appState.redoStack = [];
        syncUndoRedoBtns();
    }

    function restoreSnapshot(snapshot) {
        appState.nodes = JSON.parse(JSON.stringify(snapshot.nodes));
        appState.edges = JSON.parse(JSON.stringify(snapshot.edges));
        appState.nodeCounter = snapshot.nodeCounter;
        appState.edgeCounter = snapshot.edgeCounter;
        deselectAll();
        updateRender();
    }

    function undo() {
        if (appState.undoStack.length === 0) return;
        // Save current state to redo stack before reverting
        const current = {
            nodes: JSON.parse(JSON.stringify(appState.nodes)),
            edges: JSON.parse(JSON.stringify(appState.edges)),
            nodeCounter: appState.nodeCounter,
            edgeCounter: appState.edgeCounter
        };
        appState.redoStack.push(current);
        const prev = appState.undoStack.pop();
        restoreSnapshot(prev);
        syncUndoRedoBtns();
    }

    function redo() {
        if (appState.redoStack.length === 0) return;
        const current = {
            nodes: JSON.parse(JSON.stringify(appState.nodes)),
            edges: JSON.parse(JSON.stringify(appState.edges)),
            nodeCounter: appState.nodeCounter,
            edgeCounter: appState.edgeCounter
        };
        appState.undoStack.push(current);
        const next = appState.redoStack.pop();
        restoreSnapshot(next);
        syncUndoRedoBtns();
    }

    function syncUndoRedoBtns() {
        document.getElementById('btn-undo').disabled = appState.undoStack.length === 0;
        document.getElementById('btn-redo').disabled = appState.redoStack.length === 0;
    }

    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    syncUndoRedoBtns();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.shiftKey && e.key === 'Z') { e.preventDefault(); redo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    });

    // Patch mutation points to call saveSnapshot() before every change
    // Add state — patch mousedown handler by wrapping push
    const _origNodePush = appState.nodes.push.bind(appState.nodes);
    // Instead: we override the specific action spots by wrapping updateRender calls
    // We attach saveSnapshot to the DOM event handlers directly.

    // Re-bind delete state button with snapshot
    document.getElementById('btn-delete-state').removeEventListener('click', () => {});
    document.getElementById('btn-delete-state').addEventListener('click', () => {
        if (appState.selectedNodeId) {
            saveSnapshot();
            appState.nodes = appState.nodes.filter(n => n.id !== appState.selectedNodeId);
            appState.edges = appState.edges.filter(e => e.from !== appState.selectedNodeId && e.to !== appState.selectedNodeId);
            deselectAll();
        }
    });

    document.getElementById('btn-delete-transition').removeEventListener('click', () => {});
    document.getElementById('btn-delete-transition').addEventListener('click', () => {
        if (appState.selectedEdgeId) {
            saveSnapshot();
            appState.edges = appState.edges.filter(e => e.id !== appState.selectedEdgeId);
            deselectAll();
        }
    });

    // Wrap canvas mousedown to saveSnapshot before adding states/edges
    const origCanvasMousedown = canvas.onmousedown;
    canvas.addEventListener('mousedown', (e) => {
        const nodeGroup = e.target.closest('.state');
        if (currentMode === 'state' && !nodeGroup) {
            saveSnapshot();
        }
    }, true); // capture phase — fires before the main handler

    // Wrap mouseup to save snapshot before finalizing a new edge
    canvas.addEventListener('mouseup', (e) => {
        if (appState.isDrawingEdge) {
            const target = e.target;
            const nodeGroup = target.closest('.state');
            if (nodeGroup) {
                saveSnapshot();
            }
        }
    }, true);

    // ================================================================
    // FEATURE 2: EXPORT / IMPORT JSON
    // ================================================================
    function exportJSON() {
        const data = {
            type: 'DFA',
            version: 1,
            nodeCounter: appState.nodeCounter,
            edgeCounter: appState.edgeCounter,
            nodes: appState.nodes,
            edges: appState.edges
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dfa-automaton.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function normalizeImportedBidirectionalEdges() {
        const byPair = new Map();

        appState.edges.forEach(edge => {
            if (edge.from === edge.to) return;
            const key = [edge.from, edge.to].sort().join('|');
            if (!byPair.has(key)) byPair.set(key, []);
            byPair.get(key).push(edge);
        });

        byPair.forEach(pairEdges => {
            const [idA, idB] = pairEdges[0].from < pairEdges[0].to
                ? [pairEdges[0].from, pairEdges[0].to]
                : [pairEdges[0].to, pairEdges[0].from];
            const nodeA = appState.nodes.find(n => n.id === idA);
            const nodeB = appState.nodes.find(n => n.id === idB);
            if (!nodeA || !nodeB) return;

            const baseDx = nodeB.x - nodeA.x;
            const baseDy = nodeB.y - nodeA.y;
            const baseDist = Math.hypot(baseDx, baseDy);
            if (baseDist === 0) return;

            const pairNx = -baseDy / baseDist;
            const pairNy = baseDx / baseDist;
            const pairMidX = (nodeA.x + nodeB.x) / 2;
            const pairMidY = (nodeA.y + nodeB.y) / 2;

            const directionGroups = new Map();
            pairEdges.forEach(edge => {
                const dirKey = `${edge.from}->${edge.to}`;
                if (!directionGroups.has(dirKey)) directionGroups.set(dirKey, []);
                directionGroups.get(dirKey).push(edge);
            });

            const directions = Array.from(directionGroups.keys()).sort();
            if (directions.length < 2) return;

            const plusDirection = `${idA}->${idB}`;

            directions.forEach(dirKey => {
                const sign = dirKey === plusDirection ? 1 : -1;
                const dirEdges = directionGroups.get(dirKey).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));

                dirEdges.forEach((edge, idx) => {
                    const baseOffset = Math.min(90, Math.max(48, baseDist * 0.2));
                    const laneOffset = idx * 14;
                    const curveOffset = baseOffset + laneOffset;

                    // Always re-space imported reverse edges to avoid overlap.
                    edge.cpX = pairMidX + pairNx * curveOffset * sign;
                    edge.cpY = pairMidY + pairNy * curveOffset * sign;
                });
            });
        });
    }

    function importJSON(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.nodes || !data.edges) throw new Error('Invalid format');
                saveSnapshot();
                appState.nodes = data.nodes;
                appState.edges = data.edges;
                appState.nodeCounter = data.nodeCounter ?? (data.nodes.length);
                appState.edgeCounter = data.edgeCounter ?? (data.edges.length);
                normalizeImportedBidirectionalEdges();
                deselectAll();
                updateRender();
                document.getElementById('status-message').textContent = 'Automaton imported successfully.';
            } catch (err) {
                alert('Failed to import: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    document.getElementById('btn-export').addEventListener('click', exportJSON);
    document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-modal').style.display = 'flex';
    });

    document.getElementById('btn-import-modal-close').addEventListener('click', () => {
        document.getElementById('import-modal').style.display = 'none';
    });

    document.getElementById('btn-import-file-pick').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });

    document.getElementById('import-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('import-modal'))
            document.getElementById('import-modal').style.display = 'none';
    });
    document.getElementById('import-file-input').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            importJSON(e.target.files[0]);
            e.target.value = ''; // reset so same file can be re-imported
        }
    });

    // ================================================================
    // FEATURE 3: TRANSITION TABLE
    // ================================================================
    function buildTransitionTable() {
        // Collect all symbols used across all edges
        const symbolSet = new Set();
        appState.edges.forEach(e => e.symbols.forEach(s => symbolSet.add(s)));
        const symbols = Array.from(symbolSet).sort();

        // Build rows: one per node
        const rows = appState.nodes.map(node => {
            const cells = symbols.map(sym => {
                const targets = appState.edges
                    .filter(e => e.from === node.id && e.symbols.includes(sym))
                    .map(e => {
                        const t = appState.nodes.find(n => n.id === e.to);
                        return t ? t.label : e.to;
                    });
                return targets.length > 0 ? targets.join(', ') : null;
            });
            return { node, cells };
        });

        return { symbols, rows };
    }

    function showTransitionTable() {
        const modal = document.getElementById('table-modal');
        const container = document.getElementById('table-container');

        if (appState.nodes.length === 0) {
            container.innerHTML = '<p class="table-empty-msg">No states in the automaton yet.</p>';
            modal.style.display = 'flex';
            return;
        }

        const { symbols, rows } = buildTransitionTable();

        if (symbols.length === 0) {
            container.innerHTML = '<p class="table-empty-msg">No transitions defined yet.</p>';
            modal.style.display = 'flex';
            return;
        }

        let html = '<table class="transition-table"><thead><tr>';
        html += '<th>State</th>';
        symbols.forEach(s => { html += `<th>${s}</th>`; });
        html += '</tr></thead><tbody>';

        rows.forEach(({ node, cells }) => {
            let stateClass = 'state-header';
            if (node.isStart) stateClass += ' start-state';
            if (node.isAccept) stateClass += ' accept-state';
            const marker = node.isAccept ? `(${node.label})` : node.label;
            html += `<tr><td class="${stateClass}">${marker}</td>`;
            cells.forEach(cell => {
                if (cell) {
                    html += `<td>${cell}</td>`;
                } else {
                    html += `<td class="empty-cell">—</td>`;
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '<p style="margin-top:12px;font-family:\'JetBrains Mono\',monospace;font-size:0.72rem;color:var(--text-secondary);">→ = start state &nbsp;|&nbsp; (q) = accept state</p>';

        container.innerHTML = html;
        modal.style.display = 'flex';
    }

    document.getElementById('btn-show-table').addEventListener('click', showTransitionTable);
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('table-modal').style.display = 'none';
    });
    // Close on overlay click
    document.getElementById('table-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('table-modal')) {
            document.getElementById('table-modal').style.display = 'none';
        }
    });
    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('table-modal').style.display = 'none';
        }
    });

    // ================================================================
    // FEATURE 4: MOBILE TOUCH SUPPORT
    // ================================================================

    // Helper: convert a Touch to world-space coords
    function getTouchWorldCoords(touch) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (touch.clientX - rect.left - panX) / zoom,
            y: (touch.clientY - rect.top  - panY) / zoom
        };
    }

    let activeTouches = {}; // track active touch identifiers
    let pinchStartDist = null;
    let pinchStartZoom = null;
    let pinchStartPanX = null;
    let pinchStartPanY = null;
    let pinchMidX = null;
    let pinchMidY = null;

    function touchDist(t1, t2) {
        return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    }

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touches = e.changedTouches;

        if (e.touches.length === 2) {
            // Begin pinch-to-zoom
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            pinchStartDist = touchDist(t1, t2);
            pinchStartZoom = zoom;
            const rect = canvas.getBoundingClientRect();
            pinchMidX = ((t1.clientX + t2.clientX) / 2) - rect.left;
            pinchMidY = ((t1.clientY + t2.clientY) / 2) - rect.top;
            pinchStartPanX = panX;
            pinchStartPanY = panY;
            appState.dragNodeId = null;
            appState.isDrawingEdge = false;
            return;
        }

        // Single touch — mirror mousedown
        const touch = touches[0];
        const { x, y } = getTouchWorldCoords(touch);
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const nodeGroup = target ? target.closest('.state') : null;
        const edgeGroup = target ? target.closest('.transition') : null;

        if (currentMode === 'select' || currentMode === 'transition') {
            if (nodeGroup) {
                const nodeId = nodeGroup.getAttribute('data-id');
                if (currentMode === 'select') {
                    selectNode(nodeId);
                    appState.dragNodeId = nodeId;
                    const node = appState.nodes.find(n => n.id === nodeId);
                    appState.dragOffsetX = x - node.x;
                    appState.dragOffsetY = y - node.y;
                } else if (currentMode === 'transition') {
                    appState.isDrawingEdge = true;
                    appState.tempEdgeSourceId = nodeId;
                    appState.drawingPoints = [{ x, y }];
                    appState.mouseX = x;
                    appState.mouseY = y;
                    updateRender();
                }
                return;
            } else if (edgeGroup && currentMode === 'select') {
                selectEdge(edgeGroup.getAttribute('data-id'));
                return;
            } else if (currentMode === 'select') {
                deselectAll();
                isPanning = true;
                panStartX = touch.clientX - panX;
                panStartY = touch.clientY - panY;
                return;
            }
        }

        if (currentMode === 'state' && !nodeGroup) {
            saveSnapshot();
            appState.nodes.push({
                id: `q${appState.nodeCounter}`,
                label: `q${appState.nodeCounter}`,
                x, y,
                isStart: appState.nodes.length === 0,
                isAccept: false
            });
            appState.nodeCounter++;
            updateRender();
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();

        if (e.touches.length === 2) {
            // Pinch zoom
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const newDist = touchDist(t1, t2);
            const scaleFactor = newDist / pinchStartDist;
            const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchStartZoom * scaleFactor));

            // Adjust pan so mid-point stays fixed
            panX = pinchMidX - (pinchMidX - pinchStartPanX) * (newZoom / pinchStartZoom);
            panY = pinchMidY - (pinchMidY - pinchStartPanY) * (newZoom / pinchStartZoom);
            zoom = newZoom;
            applyPanTransform();
            return;
        }

        const touch = e.changedTouches[0];
        const { x, y } = getTouchWorldCoords(touch);
        appState.mouseX = x;
        appState.mouseY = y;

        if (isPanning) {
            panX = touch.clientX - panStartX;
            panY = touch.clientY - panStartY;
            applyPanTransform();
            return;
        }

        if (appState.dragNodeId && currentMode === 'select') {
            const node = appState.nodes.find(n => n.id === appState.dragNodeId);
            if (node) {
                node.x = x - appState.dragOffsetX;
                node.y = y - appState.dragOffsetY;
                updateRender();
            }
        } else if (appState.isDrawingEdge) {
            appState.drawingPoints.push({ x, y });
            updateRender();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        pinchStartDist = null;

        if (isPanning) {
            isPanning = false;
            return;
        }
        if (appState.dragNodeId) {
            appState.dragNodeId = null;
            return;
        }

        if (appState.isDrawingEdge) {
            const touch = e.changedTouches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const nodeGroup = target ? target.closest('.state') : null;

            if (nodeGroup) {
                const targetNodeId = nodeGroup.getAttribute('data-id');
                let existingEdge = appState.edges.find(e => e.from === appState.tempEdgeSourceId && e.to === targetNodeId);
                if (existingEdge) {
                    const cp = computeControlPoint(appState.tempEdgeSourceId, targetNodeId, appState.drawingPoints);
                    if (cp) { existingEdge.cpX = cp.x; existingEdge.cpY = cp.y; }
                    selectEdge(existingEdge.id);
                } else {
                    saveSnapshot();
                    const cp = computeControlPoint(appState.tempEdgeSourceId, targetNodeId, appState.drawingPoints);
                    const newEdge = {
                        id: `e${appState.edgeCounter++}`,
                        from: appState.tempEdgeSourceId,
                        to: targetNodeId,
                        symbols: ['ε'],
                        cpX: cp ? cp.x : null,
                        cpY: cp ? cp.y : null
                    };
                    appState.edges.push(newEdge);
                    selectEdge(newEdge.id);
                    tools.select.click();
                }
            }

            appState.isDrawingEdge = false;
            appState.tempEdgeSourceId = null;
            appState.drawingPoints = [];
            updateRender();
        }
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
        appState.dragNodeId = null;
        appState.isDrawingEdge = false;
        appState.tempEdgeSourceId = null;
        appState.drawingPoints = [];
        isPanning = false;
        pinchStartDist = null;
        updateRender();
    }, { passive: true });

});

