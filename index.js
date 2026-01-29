const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const tracksContainer = document.getElementById('tracksContainer');
const trackList = document.getElementById('trackList');
const fileInfo = document.getElementById('fileInfo');
const errorDiv = document.getElementById('error');

let midiData = null;
let parsedMidi = null;

uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('active');
    setTimeout(() => errorDiv.classList.remove('active'), 5000);
}

function handleFile(file) {
    if (!file.name.match(/\.(mid|midi)$/i)) {
        showError('Please select a valid MIDI file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            midiData = new Uint8Array(e.target.result);
            parsedMidi = parseMidi(midiData);
            displayTracks(file.name);
        } catch (err) {
            showError('Error parsing MIDI file: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function parseMidi(data) {
    let pos = 0;
    
    function readChars(n) {
        return String.fromCharCode(...data.slice(pos, pos += n));
    }
    
    function readInt(n) {
        let val = 0;
        for (let i = 0; i < n; i++) {
            val = (val << 8) | data[pos++];
        }
        return val;
    }
    
    function readVarLen() {
        let val = 0;
        let byte;
        do {
            byte = data[pos++];
            val = (val << 7) | (byte & 0x7f);
        } while (byte & 0x80);
        return val;
    }
    
    const header = readChars(4);
    if (header !== 'MThd') throw new Error('Invalid MIDI file');
    
    const headerLen = readInt(4);
    const format = readInt(2);
    const numTracks = readInt(2);
    const division = readInt(2);
    
    const tracks = [];
    
    for (let i = 0; i < numTracks; i++) {
        const trackHeader = readChars(4);
        if (trackHeader !== 'MTrk') throw new Error('Invalid track header');
        
        const trackLen = readInt(4);
        const trackStart = pos;
        const trackData = data.slice(trackStart, trackStart + trackLen);
        
        let trackName = `Track ${i + 1}`;
        let noteCount = 0;
        let tPos = 0;
        let bpm = 0;
        
        while (tPos < trackData.length) {
            const delta = readVarLen.call({}, trackData, tPos);
            let vPos = 0;
            const vRead = () => {
                let val = 0, byte;
                do {
                    byte = trackData[tPos + vPos++];
                    val = (val << 7) | (byte & 0x7f);
                } while (byte & 0x80);
                return val;
            };
            vRead();
            tPos += vPos;
            
            if (tPos >= trackData.length) break;
            
            let status = trackData[tPos++];
            
            if (status === 0xFF) {
                const type = trackData[tPos++];
                const len = trackData[tPos++];
                
                if (type === 0x03 && len > 0) {
                    trackName = String.fromCharCode(...trackData.slice(tPos, tPos + len));
                } else if (type === 0x51 && len === 3) {
                    if (bpm > 0) {
                        bpm = undefined;
                    }
                    const microsecPerQuarter = (trackData[tPos] << 16) | (trackData[tPos + 1] << 8) | trackData[tPos + 2];
                    bpm = Math.round(60000000 / microsecPerQuarter);
                }
                tPos += len;
            } else if (status === 0xF0 || status === 0xF7) {
                const len = trackData[tPos++];
                tPos += len;
            } else {
                if ((status & 0x80) === 0) {
                    tPos--;
                } else {
                    const cmd = status & 0xF0;
                    if (cmd === 0x90 || cmd === 0x80) noteCount++;
                    
                    if (cmd === 0xC0 || cmd === 0xD0) {
                        tPos += 1;
                    } else {
                        tPos += 2;
                    }
                }
            }
        }

        if (noteCount > 0) {
            tracks.push({
                name: trackName,
                data: trackData,
                noteCount,
                bpm: bpm === 0 ? 120 : bpm,
            });
        }
        
        pos = trackStart + trackLen;
    }
    
    return { format, numTracks, division, tracks };
}

function createInstrumentSelect(index) {
    const el = document.createElement('select');
    el.id = `instrument-${index}`;
    el.className = 'instrument-select';
    el.innerHTML = `
            <option value="-1">Original</option>
            <option value="0">Acoustic Grand Piano</option>
            <option value="1">Bright Acoustic Piano</option>
            <option value="4">Electric Piano 1</option>
            <option value="5">Electric Piano 2</option>
            <option value="6">Harpsichord</option>
            <option value="11">Vibraphone</option>
            <option value="24">Acoustic Guitar (nylon)</option>
            <option value="25">Acoustic Guitar (steel)</option>
            <option value="26">Electric Guitar (jazz)</option>
            <option value="27">Electric Guitar (clean)</option>
            <option value="32">Acoustic Bass</option>
            <option value="33">Electric Bass (finger)</option>
            <option value="40">Violin</option>
            <option value="41">Viola</option>
            <option value="42">Cello</option>
            <option value="48">String Ensemble 1</option>
            <option value="52">Choir Aahs</option>
            <option value="56">Trumpet</option>
            <option value="60">French Horn</option>
            <option value="64">Soprano Sax</option>
            <option value="65">Alto Sax</option>
            <option value="66">Tenor Sax</option>
            <option value="68">Oboe</option>
            <option value="71">Clarinet</option>
            <option value="73">Flute</option>
            <option value="80">Square Lead</option>
    `;
    return el;
}

function displayTracks(filename) {
    fileInfo.innerHTML = `
        <h3>${filename}</h3>
        <p>Format: ${parsedMidi.format} | Tracks: ${parsedMidi.tracks.length} | Division: ${parsedMidi.division}</p>
    `;
    
    trackList.innerHTML = '';
    
    parsedMidi.tracks.forEach((track, index) => {
        const trackItem = document.createElement('div');
        trackItem.className = 'track-item';
        const trackInfo = document.createElement('div');
        trackInfo.className = 'track-info';
        trackInfo.innerHTML = `
            <div class="track-name">${track.name}</div>
            <div class="track-details">Notes: ${track.noteCount} | Size: ${track.data.length} bytes${track.bpm !== undefined ? `| BPM: ${track.bpm}` : ''}</div>
        `;
        trackItem.appendChild(trackInfo);
        const controls = document.createElement('div');
        controls.className = 'track-controls';
        controls.appendChild(createInstrumentSelect(index));
        if (track.bpm !== undefined) {
            const tempoLabel = document.createElement('label');
            tempoLabel.innerText = 'Tempo';
            const tempoInput = document.createElement('input');
            tempoInput.type = 'number';
            tempoInput.min = '20';
            tempoInput.max = '300';
            tempoInput.value = track.bpm;
            tempoInput.className = 'tempo-input';
            tempoLabel.appendChild(tempoInput);
            controls.appendChild(tempoLabel);
        }
        const downloadButton = document.createElement('button');
        downloadButton.className = 'download-btn';
        downloadButton.addEventListener('click', () => downloadTrack(filename.split('.')[0], index, () => {
            if (track.bpm === undefined) {
                return undefined;
            }
            const value = parseInt(tempoInput.value, 10);
            if (value >= 20 && value <= 300) {
                return value;
            }
            return track.bpm;
        }));
        downloadButton.innerHTML = 'Download';
        controls.appendChild(downloadButton);
        trackItem.appendChild(controls);
        trackList.appendChild(trackItem);
    });
    
    tracksContainer.classList.add('active');
}

function downloadTrack(filename, index, getTempo) {
    const track = parsedMidi.tracks[index];
    const instrumentSelect = document.getElementById(`instrument-${index}`);
    const instrumentValue = parseInt(instrumentSelect.value);
    const tempo = getTempo();
    
    let trackData = track.data;
    
    if (instrumentValue >= 0) {
        trackData = changeInstrument(track.data, instrumentValue);
    }

    if (tempo !== undefined && tempo !== track.bpm) {
        trackData = changeTempo(trackData, tempo);
    }
    
    const header = new Uint8Array([
        0x4D, 0x54, 0x68, 0x64,
        0x00, 0x00, 0x00, 0x06,
        0x00, 0x00,
        0x00, 0x01,
        (parsedMidi.division >> 8) & 0xFF, parsedMidi.division & 0xFF
    ]);
    
    const trackHeader = new Uint8Array([
        0x4D, 0x54, 0x72, 0x6B,
        (trackData.length >> 24) & 0xFF,
        (trackData.length >> 16) & 0xFF,
        (trackData.length >> 8) & 0xFF,
        trackData.length & 0xFF
    ]);
    
    const midiFile = new Uint8Array(header.length + trackHeader.length + trackData.length);
    midiFile.set(header, 0);
    midiFile.set(trackHeader, header.length);
    midiFile.set(trackData, header.length + trackHeader.length);
    
    const blob = new Blob([midiFile], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const instName = instrumentValue >= 0 ? instrumentSelect.options[instrumentSelect.selectedIndex].text.replace(/[^a-z0-9]/gi, '_') : 'original';
    a.download = `${filename}-${track.name.replace(/[^a-z0-9]/gi, '_')}_${instName}.mid`;
    a.click();
    URL.revokeObjectURL(url);
}

function changeTempo(trackData, newTempo) {
    const microsPerQuarter = Math.round(60000000 / newTempo);
    const result = [];
    let pos = 0;
    let foundTempo = false;

    function readVarLen() {
        let val = 0;
        let byte;
        const start = pos;
        do {
            byte = trackData[pos++];
            val = (val << 7) | (byte & 0x7f);
        } while (byte & 0x80);
        return { value: val, bytes: trackData.slice(start, pos) };
    }

    while (pos < trackData.length) {
        const deltaTime = readVarLen();
        result.push(...deltaTime.bytes);
        
        if (pos >= trackData.length) break;
        
        let status = trackData[pos];
        
        if ((status & 0x80) === 0) {
            status = 0x90;
        } else {
            pos++;
            result.push(status);
        }
        
        if (status === 0xFF) {
            const type = trackData[pos++];
            const len = trackData[pos++];
            
            if (type === 0x51 && len === 3) {
                foundTempo = true;
                result.push(type, len);
                result.push((microsPerQuarter >> 16) & 0xFF);
                result.push((microsPerQuarter >> 8) & 0xFF);
                result.push(microsPerQuarter & 0xFF);
                pos += len;
            } else {
                result.push(type, len);
                for (let i = 0; i < len; i++) {
                    result.push(trackData[pos++]);
                }
            }
        } else if (status === 0xF0 || status === 0xF7) {
            const len = trackData[pos++];
            result.push(len);
            for (let i = 0; i < len; i++) {
                result.push(trackData[pos++]);
            }
        } else {
            const cmd = status & 0xF0;
            
            if (cmd === 0xC0 || cmd === 0xD0) {
                result.push(trackData[pos++]);
            } else if (cmd === 0x80 || cmd === 0x90 || cmd === 0xA0 || cmd === 0xB0 || cmd === 0xE0) {
                result.push(trackData[pos++]);
                result.push(trackData[pos++]);
            }
        }
    }
    
    if (!foundTempo) {
        const tempoEvent = [
            0x00,
            0xFF, 0x51, 0x03,
            (microsPerQuarter >> 16) & 0xFF,
            (microsPerQuarter >> 8) & 0xFF,
            microsPerQuarter & 0xFF
        ];
        return new Uint8Array([...tempoEvent, ...result]);
    }
    
    return new Uint8Array(result);
}

function changeInstrument(trackData, newInstrument) {
    const result = [];
    let pos = 0;
    let runningStatus = 0;
    
    function readVarLen() {
        let val = 0;
        let byte;
        const start = pos;
        do {
            byte = trackData[pos++];
            val = (val << 7) | (byte & 0x7f);
        } while (byte & 0x80);
        return { value: val, bytes: trackData.slice(start, pos) };
    }
    
    while (pos < trackData.length) {
        const deltaTime = readVarLen();
        result.push(...deltaTime.bytes);
        
        if (pos >= trackData.length) break;
        
        let status = trackData[pos];
        
        if ((status & 0x80) === 0) {
            status = runningStatus;
        } else {
            pos++;
            result.push(status);
            runningStatus = status;
        }
        
        if (status === 0xFF) {
            const type = trackData[pos++];
            const len = trackData[pos++];
            result.push(type, len);
            for (let i = 0; i < len; i++) {
                result.push(trackData[pos++]);
            }
        } else if (status === 0xF0 || status === 0xF7) {
            const len = trackData[pos++];
            result.push(len);
            for (let i = 0; i < len; i++) {
                result.push(trackData[pos++]);
            }
        } else {
            const cmd = status & 0xF0;
            const channel = status & 0x0F;
            
            if (cmd === 0xC0) {
                pos++;
                result.push(newInstrument);
            } else if (cmd === 0xD0) {
                result.push(trackData[pos++]);
            } else if (cmd === 0x80 || cmd === 0x90 || cmd === 0xA0 || cmd === 0xB0 || cmd === 0xE0) {
                result.push(trackData[pos++]);
                result.push(trackData[pos++]);
            }
        }
    }
    
    const hasInstrumentChange = trackData.some((byte, i) => {
        if (i === 0) return false;
        const prevByte = trackData[i - 1];
        return (prevByte & 0xF0) === 0xC0 && (prevByte & 0x80) !== 0;
    });
    
    if (!hasInstrumentChange) {
        const programChange = [0x00, 0xC0, newInstrument];
        return new Uint8Array([...programChange, ...result]);
    }
    
    return new Uint8Array(result);
}
