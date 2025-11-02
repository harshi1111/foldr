const { dialog, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

document.addEventListener('DOMContentLoaded', function() {
    const projectInput = document.getElementById('projectInput');
    const parseBtn = document.getElementById('parseBtn');
    const clearBtn = document.getElementById('clearBtn');
    const chooseFolderBtn = document.getElementById('chooseFolderBtn');
    const createBtn = document.getElementById('createBtn');
    const preview = document.getElementById('preview');
    const folderPath = document.getElementById('folderPath');

    let selectedFolder = '';
    let currentStructure = [];

    parseBtn.addEventListener('click', parseStructure);
    clearBtn.addEventListener('click', clearAll);
    chooseFolderBtn.addEventListener('click', chooseFolder);
    createBtn.addEventListener('click', createProject);

    // Auto-parse when pasting
    projectInput.addEventListener('paste', function() {
        setTimeout(parseStructure, 100);
    });

    function chooseFolder() {
        // Use IPC to communicate with main process
        ipcRenderer.invoke('select-folder').then(result => {
            if (result) {
                selectedFolder = result;
                folderPath.textContent = `Selected: ${selectedFolder}`;
                updateCreateButton();
            }
        }).catch(error => {
            console.error('Error selecting folder:', error);
        });
    }

    function parseStructure() {
        const input = projectInput.value.trim();
        if (!input) {
            showPreview('Please paste your project structure first!');
            return;
        }

        try {
            currentStructure = parseInput(input);
            displayPreview(currentStructure);
            updateCreateButton();
        } catch (error) {
            showMessage('❌ Failed to parse. Try a cleaner format.', 'error');
            console.error(error);
        }
    }

    function parseInput(input) {
        const lines = input.split('\n').filter(line => line.trim());
        const structure = [];
        const stack = [{ level: -1, path: '' }];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const level = getIndentationLevel(line);
            const name = cleanLine(trimmed);
            
            if (!name) continue;

            // Find the appropriate parent
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            const parent = stack[stack.length - 1];
            const fullPath = parent.path ? `${parent.path}/${name}` : name;
            const type = determineType(name, trimmed);

            const item = { 
                name, 
                type, 
                path: fullPath,
                children: type === 'folder' ? [] : null 
            };

            // Find where to add this item
            let targetArray = structure;
            if (stack.length > 1) {
                targetArray = stack[stack.length - 1].children;
            }

            targetArray.push(item);

            if (type === 'folder') {
                stack.push({ level, path: fullPath, children: item.children });
            }
        }

        return structure;
    }

    function getIndentationLevel(line) {
        // Count leading spaces, tabs, and tree characters
        const match = line.match(/^[\s│├└──]*/);
        return match ? match[0].length : 0;
    }

    function cleanLine(line) {
        // Remove tree characters and clean up
        return line.replace(/[│├└──]/g, '')
                  .replace(/\/$/, '') // Remove trailing slash
                  .trim();
    }

    function determineType(name, originalLine) {
        // More intelligent type detection
        if (name.endsWith('/')) return 'folder';
        if (originalLine.includes('/') && !name.includes('.')) return 'folder';
        if (name.includes('.')) return 'file';
        if (originalLine.toLowerCase().includes('directory')) return 'folder';
        
        // Default to file if uncertain
        return 'file';
    }

    function displayPreview(structure) {
        if (structure.length === 0) {
            showMessage('No valid structure found.', 'info');
            return;
        }

        const html = generateTreeHTML(structure);
        preview.innerHTML = `<div style="line-height: 1.5;">${html}</div>`;
    }

    function generateTreeHTML(structure, prefix = '') {
        let html = '';
        
        structure.forEach((item, index) => {
            const isLast = index === structure.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            
            const icon = item.type === 'folder' ? '📁' : '📄';
            const color = item.type === 'folder' ? '#ce4249' : '#ccc';
            
            html += `<div style="color: ${color}; font-weight: ${item.type === 'folder' ? 'bold' : 'normal'};">
                ${prefix}${connector}${icon} ${item.name}
            </div>`;
            
            if (item.children) {
                html += generateTreeHTML(item.children, newPrefix);
            }
        });
        
        return html;
    }

    function updateCreateButton() {
        createBtn.disabled = !(selectedFolder && currentStructure.length > 0);
    }

    async function createProject() {
        if (!selectedFolder || currentStructure.length === 0) {
            showMessage('Please select a folder and parse a structure first.', 'info');
            return;
        }

        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
        
        try {
            // Show building animation
            showCreatingAnimation(currentStructure);
            
            // Small delay to show animation
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            await createFilesAndFolders(currentStructure, selectedFolder);
            
            // Show elegant success
            showElegantSuccess('Project structure created successfully!');
        } catch (error) {
            // Remove loading overlay if error
            const loadingOverlay = document.getElementById('creatingOverlay');
            if (loadingOverlay) loadingOverlay.remove();
            
            showMessage(`Error: ${error.message}`, 'error');
            console.error(error);
        } finally {
            createBtn.disabled = false;
            createBtn.textContent = '🚀 Create Project';
        }
    }

    function createFilesAndFolders(structure, basePath) {
        return new Promise((resolve, reject) => {
            try {
                structure.forEach(item => {
                    const fullPath = path.join(basePath, item.path);
                    
                    if (item.type === 'folder') {
                        if (!fs.existsSync(fullPath)) {
                            fs.mkdirSync(fullPath, { recursive: true });
                        }
                        if (item.children) {
                            createFilesAndFolders(item.children, basePath);
                        }
                    } else {
                        // Create empty file
                        const dir = path.dirname(fullPath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        if (!fs.existsSync(fullPath)) {
                            fs.writeFileSync(fullPath, '');
                        }
                    }
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    function showCreatingAnimation(structure) {
        const totalItems = countItems(structure);
        
        const overlay = document.createElement('div');
        overlay.id = 'creatingOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 5, 5, 0.95);
            backdrop-filter: blur(10px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.3s ease;
        `;

        overlay.innerHTML = `
            <style>
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes folderBuild {
                    0% { transform: scale(0.8) translateY(-10px); opacity: 0; }
                    50% { transform: scale(1.1) translateY(0); opacity: 1; }
                    100% { transform: scale(1) translateY(0); opacity: 1; }
                }
                @keyframes progressPulse {
                    0%, 100% { background: rgba(206, 66, 73, 0.3); }
                    50% { background: rgba(206, 66, 73, 0.6); }
                }
                @keyframes progressScan {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                }
                .building-folder { animation: folderBuild 1.2s ease-out infinite; }
            </style>
            
            <div style="
                background: rgba(206, 66, 73, 0.1);
                border: 2px solid rgba(206, 66, 73, 0.3);
                border-radius: 16px;
                padding: 40px;
                text-align: center;
                max-width: 500px;
                backdrop-filter: blur(10px);
            ">
                <!-- Animated Folder Icon -->
                <div style="font-size: 4rem; margin-bottom: 20px;" class="building-folder">
                    📁
                </div>
                
                <!-- Progress Text -->
                <div style="color: #ce4249; font-size: 1.5rem; font-weight: bold; margin-bottom: 20px;">
                    Building Your Structure...
                </div>
                
                <!-- Minimalist Progress Dots -->
                <div style="display: flex; justify-content: center; gap: 8px; margin-bottom: 30px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #ce4249; animation: progressPulse 1.5s infinite;"></div>
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #ce4249; animation: progressPulse 1.5s infinite 0.2s;"></div>
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #ce4249; animation: progressPulse 1.5s infinite 0.4s;"></div>
                </div>
                
                <!-- Progress Bar -->
                <div style="background: rgba(255,255,255,0.1); height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 20px; position: relative;">
                    <div style="height: 100%; background: #ce4249; width: 100%; border-radius: 2px; position: relative; overflow: hidden;">
                        <div style="position: absolute; top: 0; left: 0; height: 100%; width: 20%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent); animation: progressScan 1.5s ease-in-out infinite;"></div>
                    </div>
                </div>
                
                <!-- File Counter -->
                <div style="color: #888; font-size: 0.9rem;">
                    Creating ${totalItems} files and folders
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    function showElegantSuccess(message) {
        // Remove loading overlay
        const loadingOverlay = document.getElementById('creatingOverlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.id = 'successOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 5, 5, 0.95);
            backdrop-filter: blur(15px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.5s ease;
        `;

        overlay.innerHTML = `
            <style>
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes successRipple {
                    0% { transform: scale(0.8); opacity: 0; }
                    50% { transform: scale(1.1); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes folderFloat {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes redRipple {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
                }
                .success-ripple { animation: successRipple 0.6s ease-out; }
                .floating-folder { animation: folderFloat 2s ease-in-out infinite; }
            </style>
            
            <div class="success-ripple" style="
                background: linear-gradient(135deg, rgba(12, 58, 29, 0.9), rgba(8, 43, 21, 0.9));
                border: 2px solid #0fa;
                border-radius: 20px;
                padding: 50px 40px;
                text-align: center;
                max-width: 500px;
                position: relative;
                overflow: hidden;
            ">
                <!-- Red Ripple Effect -->
                <div style="position: absolute; top: 50%; left: 50%; width: 100px; height: 100px; background: radial-gradient(circle, rgba(206, 66, 73, 0.3) 0%, transparent 70%); border-radius: 50%; transform: translate(-50%, -50%); animation: redRipple 1s ease-out;"></div>
                
                <!-- Clean Success Icon -->
                <div style="margin-bottom: 25px;">
                    <div style="font-size: 4rem; margin-bottom: 15px;" class="floating-folder">📁</div>
                </div>
                
                <!-- Success Message -->
                <div style="color: #0fa; font-size: 1.8rem; font-weight: bold; margin-bottom: 15px;">
                    Structure Complete!
                </div>
                
                <div style="color: #fff; font-size: 1.2rem; margin-bottom: 25px; line-height: 1.5;">
                    ${message}
                </div>
                
                <div style="color: #888; font-size: 1rem; margin-bottom: 30px;">
                    Check your file manager 🗂️
                </div>
                
                <button onclick="closeSuccessOverlay()" style="
                    background: linear-gradient(135deg, #ce4249, #b8383f);
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 8px;
                    font-size: 1rem;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                " onmouseover="this.style.transform='translateY(-2px)'" 
                onmouseout="this.style.transform='translateY(0)'">
                    Continue Creating
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        window.closeSuccessOverlay = function() {
            const overlay = document.getElementById('successOverlay');
            if (overlay) {
                overlay.style.animation = 'fadeOut 0.5s ease forwards';
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 500);
            }
        };
    }

    function countItems(structure) {
        let count = 0;
        structure.forEach(item => {
            count++;
            if (item.children) {
                count += countItems(item.children);
            }
        });
        return count;
    }

    function showMessage(message, type = 'info') {
        const colors = {
            success: { bg: '#0c3a1d', border: '#0fa', text: '#0fa', icon: '✅' },
            error: { bg: '#3a0c0c', border: '#ce4249', text: '#ce4249', icon: '❌' },
            info: { bg: '#1a1a2e', border: '#667eea', text: '#ccc', icon: '💡' }
        };
        
        const style = colors[type] || colors.info;
        
        preview.innerHTML = `
            <div style="
                background: ${style.bg};
                border: 2px solid ${style.border};
                border-radius: 12px;
                padding: 30px;
                text-align: center;
                margin: 20px 0;
                box-shadow: 0 8px 25px rgba(0,0,0,0.3);
            ">
                <div style="font-size: 3rem; margin-bottom: 15px;">${style.icon}</div>
                <div style="color: ${style.text}; font-size: 1.3rem; font-weight: bold; margin-bottom: 10px;">
                    ${message}
                </div>
                <div style="color: #888; font-size: 0.9rem;">
                    ${type === 'success' ? 'Check your file explorer! 🗂️s' : 'Please try again'}
                </div>
            </div>
        `;
    }

    function showPreview(message) {
        preview.innerHTML = `<p style="color: #666;">${message}</p>`;
    }

    function clearAll() {
        projectInput.value = '';
        selectedFolder = '';
        currentStructure = [];
        folderPath.textContent = 'No folder selected';
        showPreview('Your file tree will appear here...');
        createBtn.disabled = true;
    }
});