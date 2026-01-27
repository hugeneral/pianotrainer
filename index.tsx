import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';

/**
 * MUSIC DATA & CONFIG
 */
const MIDI_TO_ALPHATAB: Record<number, string> = {
  36: 'c3', 37: 'c#3', 38: 'd3', 39: 'd#3', 40: 'e3', 41: 'f3', 42: 'f#3', 43: 'g3', 44: 'g#3', 45: 'a3', 46: 'a#3', 47: 'b3',
  48: 'c4', 49: 'c#4', 50: 'd4', 51: 'd#4', 52: 'e4', 53: 'f4', 54: 'f#4', 55: 'g4', 56: 'g#4', 57: 'a4', 58: 'a#4', 59: 'b4',
  60: 'c5', 61: 'c#5', 62: 'd5', 63: 'd#5', 64: 'e5', 65: 'f5', 66: 'f#5', 67: 'g5', 68: 'g#5', 69: 'a5', 70: 'a#5', 71: 'b5',
  72: 'c6', 73: 'c#6', 74: 'd6', 75: 'd#6', 76: 'e6', 77: 'f6', 78: 'f#6', 79: 'g6', 80: 'g#6', 81: 'a6', 82: 'a#6', 83: 'b6',
  84: 'c7', 85: 'c#7', 86: 'd7', 87: 'd#7', 88: 'e7', 89: 'f7', 90: 'f#7', 91: 'g7', 92: 'g#7', 93: 'a7', 94: 'a#7', 95: 'b7'
};

const KBD_MAP: Record<string, number> = {
  'a': 48, 's': 50, 'd': 52, 'f': 53, 'g': 55, 'h': 57, 'j': 59, 'k': 60, 'l': 62, ';': 64,
  'q': 60, 'w': 62, 'e': 64, 'r': 65, 't': 67, 'y': 69, 'u': 71, 'i': 72, 'o': 74, 'p': 76
};

const DURATION_MAP: Record<number, string> = {
  1: '16', 2: '8', 4: '4', 8: '2', 16: '1'
};

const LATENCY_MS = 60; // Global latency compensation for analysis
const PERFECT_WINDOW_MS = 35; // Window in ms to consider a note perfect

const getTimingColorHex = (diffMs: number): string => {
  if (Math.abs(diffMs) < PERFECT_WINDOW_MS) return '#64748b'; // Slate (Perfect)
  if (diffMs < 0) return '#3b82f6'; // Blue (Early)
  return '#f43f5e'; // Rose (Late)
};

const getTimingLabel = (diffMs: number): string => {
  if (Math.abs(diffMs) < PERFECT_WINDOW_MS) return 'PERFECT';
  return diffMs < 0 ? `${Math.abs(Math.round(diffMs))}ms EARLY` : `${Math.round(diffMs)}ms LATE`;
};

const useMidi = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [midiSignal, setMidiSignal] = useState<{data: number[], timeStamp: number, source: 'midi' | 'keyboard'} | null>(null);

  useEffect(() => {
    let midiAccess: any = null;
    
    const onMessage = (msg: any) => {
        const data = Array.from(msg.data) as number[];
        // Filter out Active Sensing (254/0xFE) and Clock (248/0xF8) messages which can spam the app
        if (data[0] >= 240) return;
        setMidiSignal({ data, timeStamp: performance.now(), source: 'midi' });
    };

    const onStateChange = () => {
      if (!midiAccess) return;
      const inputs = Array.from(midiAccess.inputs.values());
      setIsConnected(inputs.length > 0);
      // Re-bind to ensure new devices are caught
      inputs.forEach((input: any) => { 
          input.onmidimessage = onMessage; 
      });
    };

    if ((navigator as any).requestMIDIAccess) {
      (navigator as any).requestMIDIAccess({ sysex: false }).then((access: any) => {
        midiAccess = access;
        access.onstatechange = onStateChange;
        onStateChange();
      }).catch((e: any) => {
          console.error("MIDI Access Failed", e);
          setIsConnected(false);
      });
    }

    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      const midi = KBD_MAP[e.key.toLowerCase()];
      if (midi) {
        setMidiSignal({
          data: [isDown ? 144 : 128, midi, isDown ? 100 : 0],
          timeStamp: performance.now(),
          source: 'keyboard'
        });
      }
    };

    const downListener = (e: KeyboardEvent) => !e.repeat && handleKey(e, true);
    const upListener = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener('keydown', downListener);
    window.addEventListener('keyup', upListener);
    return () => {
      window.removeEventListener('keydown', downListener);
      window.removeEventListener('keyup', upListener);
    };
  }, []);

  return { isConnected, midiSignal };
};

interface RecordedNote {
  id: string;
  midi: number;
  diffMs: number;
  measure: number;
  beatIndex: number;
  sixteenthIndex: number;
  durationSixteenths: number; 
}

const ScoreDisplay = ({ notes, timeSig, measures, isSessionActive, tempo, onDebugLog }: { notes: RecordedNote[], timeSig: {beats: number, value: number}, measures: number, isSessionActive: boolean, tempo: number, onDebugLog?: React.Dispatch<React.SetStateAction<string>> }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  const metadataRef = useRef<any[]>([]);
  const isSessionActiveRef = useRef(isSessionActive);
  const onDebugLogRef = useRef(onDebugLog);

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);
  
  useEffect(() => {
    onDebugLogRef.current = onDebugLog;
  }, [onDebugLog]);

  const buildTex = useCallback((recordedNotes: RecordedNote[]) => {
    let tex = `\\tempo ${tempo}\r\n`;
    tex += `\\ts ${timeSig.beats} ${timeSig.value} \\clef treble `; 

    const sixteenthsPerBeat = 16 / timeSig.value;
    const measureSixteenths = timeSig.beats * sixteenthsPerBeat;
    const totalSixteenths = measures * measureSixteenths;
    const texMetadata: any[] = [];

    let currentSixteenth = 0;
    while (currentSixteenth < totalSixteenths) {
      const inMeasureIdx = currentSixteenth % measureSixteenths;
      const remainingInMeasure = measureSixteenths - inMeasureIdx;
      
      const startsAtSlot = recordedNotes.filter(n => 
        (n.measure * measureSixteenths) + (n.beatIndex * sixteenthsPerBeat) + n.sixteenthIndex === currentSixteenth
      );

      if (startsAtSlot.length > 0) {
        const rawDur = Math.max(...startsAtSlot.map(n => n.durationSixteenths));
        
        let snappedDur = 1;
        const allowed = [16, 8, 4, 2, 1];
        for (const d of allowed) {
            if (d <= rawDur && d <= remainingInMeasure) {
                snappedDur = d;
                break;
            }
        }
        
        const rhythm = DURATION_MAP[snappedDur] || '16';
        
        if (startsAtSlot.length === 1) {
          const noteName = MIDI_TO_ALPHATAB[startsAtSlot[0].midi] || 'c4';
          tex += `${noteName}.${rhythm} `;
        } else {
          tex += "(";
          startsAtSlot.forEach((h, idx) => {
            const noteName = MIDI_TO_ALPHATAB[h.midi] || 'c4';
            tex += `${noteName}${idx === startsAtSlot.length - 1 ? '' : ' '}`;
          });
          tex += ").";
          tex += `${rhythm} `;
        }
        
        texMetadata.push({ hits: startsAtSlot });
        currentSixteenth += snappedDur;
      } else {
        const activeNotes = recordedNotes.filter(n => {
          const startIdx = (n.measure * measureSixteenths) + (n.beatIndex * sixteenthsPerBeat) + n.sixteenthIndex;
          const endIdx = startIdx + n.durationSixteenths;
          return currentSixteenth > startIdx && currentSixteenth < endIdx;
        });

        if (activeNotes.length > 0) {
          currentSixteenth++;
        } else {
          tex += "r.16 ";
          texMetadata.push({ hits: null });
          currentSixteenth++;
        }
      }

      if (currentSixteenth > 0 && currentSixteenth % measureSixteenths === 0 && currentSixteenth < totalSixteenths) {
        tex += "| ";
      }
    }

    return { tex, texMetadata };
  }, [timeSig.beats, timeSig.value, measures, tempo]);

  useLayoutEffect(() => {
    if (!containerRef.current || apiRef.current) return;

    try {
      const alphaTab = (window as any).alphaTab;
      if (!alphaTab) throw new Error("AlphaTab SDK not loaded.");
      
      const AlphaTabApi = alphaTab.AlphaTabApi;
      const model = alphaTab.model || (alphaTab as any).Model;
      
      if (!model) { console.warn("AlphaTab model namespace not found"); }

      const NoteStyle = model?.NoteStyle;
      const BeatStyle = model?.BeatStyle;
      const Color = model?.Color;
      const NoteSubElement = model?.NoteSubElement;
      const BeatSubElement = model?.BeatSubElement;

      apiRef.current = new AlphaTabApi(containerRef.current, {
        display: {
          staveProfile: 'Score',
          layoutMode: 'horizontal',
          scale: 1.25,
          padding: [20, 20, 20, 20],
          resources: { 
            staffLineColor: '#cbd5e1', 
            mainColor: '#1e293b',
            secondaryColor: '#64748b'
          }
        },
      });

      apiRef.current.scoreLoaded.on((score: any) => {
        if (isSessionActiveRef.current) return;
        
        try {
          const metadata = metadataRef.current;
          let colorDebugLog = '';
          let coloredCount = 0;
          
          if (!metadata || metadata.length === 0) return;

          let globalIndex = 0;
          
          for (const track of score.tracks) {
            for (const staff of track.staves) {
              for (const bar of staff.bars) {
                for (const voice of bar.voices) {
                  for (const beat of voice.beats) {
                    const meta = metadata[globalIndex];
                    
                    if (globalIndex < metadata.length) {
                      if (!beat.isRest && meta && meta.hits && meta.hits.length > 0) {
                        const diffMs = meta.hits[0].diffMs;
                        
                        if (Color && typeof Color === 'function') {
                          const colorHex = getTimingColorHex(diffMs);
                          const r = parseInt(colorHex.slice(1, 3), 16);
                          const g = parseInt(colorHex.slice(3, 5), 16);
                          const b = parseInt(colorHex.slice(5, 7), 16);
                          
                          try {
                            const color = new Color(255, r, g, b);

                            // Apply to Beat (Beams, Flags, and Stems for beamed notes)
                            if (BeatStyle && BeatSubElement) {
                                if (!beat.style) beat.style = new BeatStyle();
                                if (BeatSubElement.StandardNotationBeams !== undefined) beat.style.colors.set(BeatSubElement.StandardNotationBeams, color);
                                if (BeatSubElement.StandardNotationFlag !== undefined) beat.style.colors.set(BeatSubElement.StandardNotationFlag, color);
                                // Stems in beams often controlled by beat
                                if (BeatSubElement.StandardNotationStem !== undefined) beat.style.colors.set(BeatSubElement.StandardNotationStem, color);
                            }

                            // Apply to Notes (Heads, Stems, Accidentals)
                            if (NoteStyle && NoteSubElement && beat.notes) {
                                for (const note of beat.notes) {
                                    if (!note.style) note.style = new NoteStyle();
                                    
                                    if (NoteSubElement.StandardNotationNoteHead !== undefined) note.style.colors.set(NoteSubElement.StandardNotationNoteHead, color);
                                    if (NoteSubElement.StandardNotationStem !== undefined) note.style.colors.set(NoteSubElement.StandardNotationStem, color);
                                    if (NoteSubElement.StandardNotationAccidental !== undefined) note.style.colors.set(NoteSubElement.StandardNotationAccidental, color);
                                }
                            }

                            coloredCount++;
                            const status = Math.abs(diffMs) < PERFECT_WINDOW_MS ? 'PERFECT' : diffMs < 0 ? 'EARLY' : 'LATE';
                            colorDebugLog += `Note #${globalIndex} (Bar ${bar.index !== undefined ? bar.index + 1 : '?'}) [${diffMs > 0 ? '+' : ''}${Math.round(diffMs)}ms] [${status}] -> ${colorHex}\n`;
                          } catch (err) {
                            console.error(`[Error] Color application failed: ${err}`);
                          }
                        }
                      }
                    }
                    globalIndex++;
                  }
                }
              }
            }
          }
          
          setTimeout(() => {
            if (apiRef.current) {
              try { apiRef.current.render(); } catch (e) { console.warn("Render failed", e); }
            }
            if (onDebugLogRef.current && coloredCount > 0) {
              onDebugLogRef.current(prev => prev + `\n\n[System] Painted ${coloredCount} elements.\n[Coloring Commands]\n${colorDebugLog}`);
            }
          }, 10);
        } catch (innerErr: any) {
          console.error("Critical error in scoreLoaded", innerErr);
          if (onDebugLogRef.current) onDebugLogRef.current(prev => prev + `\n[Critical] ${innerErr.message}`);
        }
      });

      apiRef.current.tex(buildTex([]).tex);

    } catch (e: any) {
      setError(`Interface Error: ${e.message}`);
    }

    return () => {
      if (apiRef.current) {
        apiRef.current.destroy();
        apiRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!apiRef.current || !!error) return;
    isSessionActiveRef.current = isSessionActive;
    if (isNaN(tempo) || isNaN(timeSig.beats) || isNaN(measures)) return;

    const { tex, texMetadata } = buildTex(notes);
    metadataRef.current = texMetadata;
    
    if (onDebugLog) onDebugLog(`Generated AlphaTex:\n${tex}\n\nMetadata Slots: ${texMetadata.length}`);

    try {
      apiRef.current.tex(tex);
    } catch (e) {
      console.error("Render failed", e);
    }
  }, [notes, isSessionActive, timeSig.beats, timeSig.value, measures, error, buildTex, tempo, onDebugLog]);

  return (
    <div className="flex-1 min-h-[300px] bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative flex flex-col overflow-hidden shrink-0">
      <div className="flex justify-between items-center mb-4 shrink-0 px-2">
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Practice Analysis</h2>
          <p className="text-[11px] text-slate-400 mt-1">Tempo: {tempo} BPM • Meter: {timeSig.beats}/{timeSig.value}</p>
        </div>
        {!isSessionActive && notes.length > 0 && (
          <div className="flex gap-4">
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6]" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Early</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-slate-500 border border-slate-500 rounded-full" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Perfect</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-500 rounded-full shadow-[0_0_8px_#f43f5e]" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Late</span></div>
          </div>
        )}
      </div>

      <div className="flex-1 rounded-2xl bg-white border border-slate-200 relative overflow-hidden shadow-inner min-h-[150px]">
        {error ? (
          <div className="text-center p-8">
            <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Restart Engine</button>
          </div>
        ) : (
          <>
            {isSessionActive && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/20 backdrop-blur-[2px]">
                <div className="w-20 h-20 rounded-full border-2 border-slate-500/30 flex items-center justify-center animate-pulse">
                   <div className="w-5 h-5 bg-slate-400 rounded-full shadow-[0_0_25px_#64748b]" />
                </div>
                <p className="text-slate-500 font-mono text-[11px] tracking-[0.6em] uppercase mt-8 font-black ml-[0.6em] animate-pulse">Recording Performance...</p>
                <p className="text-slate-400 text-[9px] mt-2 font-bold uppercase tracking-widest">Score will appear after STOP</p>
              </div>
            )}
            <div ref={containerRef} className="alphaTab-container w-full h-full overflow-auto transition-opacity duration-500" style={{ opacity: isSessionActive ? 0.05 : 1 }} />
          </>
        )}
      </div>
    </div>
  );
};

const Telemetry = ({ notes, isSessionActive }: { notes: RecordedNote[], isSessionActive: boolean }) => {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [notes]);

  return (
    <div className={`h-44 bg-slate-950 border transition-all duration-500 rounded-3xl flex flex-col overflow-hidden shadow-2xl shrink-0 ${isSessionActive ? 'border-slate-500/40' : 'border-slate-800'}`}>
      <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/40 shrink-0">
        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Live Telemetry</h3>
        {isSessionActive && <span className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] flex items-center gap-2"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-ping" /> Synchronized Feed</span>}
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-[11px]">
        {notes.length === 0 ? (
          <div className="h-full flex items-center justify-center opacity-30">
            <p className="font-black text-slate-700 uppercase tracking-[0.5em]">System Idle</p>
          </div>
        ) : (
          notes.map(n => (
            <div key={n.id} className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800/60 transition-all hover:bg-slate-800/40 animate-in fade-in slide-in-from-right-2">
               <div className="flex items-center gap-6">
                  <div className="w-12 h-6 flex items-center justify-center bg-slate-800 rounded-md text-slate-500 font-bold border border-slate-700 text-[9px]">MIDI {n.midi}</div>
                  <span className={`font-black tracking-wider w-32 ${Math.abs(n.diffMs) < PERFECT_WINDOW_MS ? 'text-slate-500' : n.diffMs < 0 ? 'text-blue-400' : 'text-rose-500'}`}>{getTimingLabel(n.diffMs)}</span>
               </div>
               <span className="text-[9px] text-slate-600 font-black uppercase">Bar {n.measure+1} • Pos {n.beatIndex+1}.{n.sixteenthIndex+1}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [tempo, setTempo] = useState(100);
  const [timeSig, setTimeSig] = useState({ beats: 4, value: 4 });
  const [measures, setMeasures] = useState(4);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isIntro, setIsIntro] = useState(false);
  const [recordedNotes, setRecordedNotes] = useState<RecordedNote[]>([]);
  const [visualBeat, setVisualBeat] = useState(false);
  const [activeInput, setActiveInput] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const { isConnected, midiSignal } = useMidi();
  const audioCtx = useRef<AudioContext | null>(null);
  const metTimer = useRef<any>(null);
  const activeNotes = useRef<Map<number, any>>(new Map());

  const tempoRef = useRef(tempo);
  const timeSigRef = useRef(timeSig);
  const measuresRef = useRef(measures);
  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { timeSigRef.current = timeSig; }, [timeSig]);
  useEffect(() => { measuresRef.current = measures; }, [measures]);

  const state = useRef({
    nextNoteTime: 0,
    currentBeat: 0,
    measureCount: 0,
    isRecording: false,
    beatTimes: [] as { audioTime: number, perfTime: number }[],
  });

  const stop = useCallback(() => {
    if (metTimer.current) clearTimeout(metTimer.current);
    setIsPlaying(false);
    setIsIntro(false);
    state.current.isRecording = false;
  }, []);

  const playSynth = useCallback((midi: number) => {
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume();

    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    
    // Frequency for MIDI note
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    osc.frequency.value = freq;
    osc.type = 'triangle'; 
    
    // Simple envelope
    const now = audioCtx.current.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    
    osc.start(now);
    osc.stop(now + 0.5);
  }, []);

  const tick = useCallback(() => {
    if (!audioCtx.current) return;
    while (state.current.nextNoteTime < audioCtx.current.currentTime + 0.1) {
      const time = state.current.nextNoteTime;
      const isDown = state.current.currentBeat === 0;
      
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      osc.frequency.value = isDown ? 1000 : 700;
      gain.gain.setValueAtTime(isDown ? 0.3 : 0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      osc.connect(gain); gain.connect(audioCtx.current.destination);
      osc.start(time); osc.stop(time + 0.1);

      const delayMs = (time - audioCtx.current.currentTime) * 1000;
      const perfTime = performance.now() + delayMs;
      state.current.beatTimes.push({ audioTime: time, perfTime });
      
      setTimeout(() => { 
        setVisualBeat(true); 
        setTimeout(() => setVisualBeat(false), 80); 

        // Start recording exactly after the selected number of intro beats
        if (state.current.beatTimes.length === timeSigRef.current.beats + 1) {
          state.current.isRecording = true;
          setIsIntro(false);
        }
      }, Math.max(0, delayMs));

      state.current.nextNoteTime += 60.0 / tempoRef.current;
      state.current.currentBeat++;
      if (state.current.currentBeat >= timeSigRef.current.beats) {
        state.current.currentBeat = 0; 
        state.current.measureCount++;
        if (state.current.measureCount >= (measuresRef.current + 1)) { 
          setTimeout(stop, 500); 
          return; 
        }
      }
    }
    metTimer.current = setTimeout(tick, 25);
  }, [stop]);

  const onStart = () => {
    if (isPlaying) { stop(); return; }
    audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume();
    state.current = { nextNoteTime: audioCtx.current.currentTime + 0.1, currentBeat: 0, measureCount: 0, isRecording: false, beatTimes: [] };
    setRecordedNotes([]);
    setIsPlaying(true); setIsIntro(true); tick();
  };

  useEffect(() => {
    if (midiSignal) {
      const [statusByte, rawMidi, vel] = midiSignal.data;
      
      // Real MIDI devices often send Middle C as 60.
      // If the user feels this is too high on the score, we shift down by an octave (12 semitones).
      const midi = midiSignal.source === 'midi' ? rawMidi - 12 : rawMidi;

      // MASK the status byte to ignore channel information (0x90 vs 0x91 etc)
      const command = statusByte & 0xF0; 
      
      const isNoteOn = (command === 0x90) && vel > 0;
      const isNoteOff = (command === 0x80) || ((command === 0x90) && vel === 0);

      // 1. Instant Feedback (Audio + Visual)
      setActiveInput(true);
      
      // Only play synth sound if NO external MIDI device is connected
      // (User likely wants to hear the real instrument instead)
      if (isNoteOn && !isConnected) {
        playSynth(midi);
      }
      
      const timer = setTimeout(() => setActiveInput(false), 150);

      // Latency compensation: Adjust input time by fixed amount to correct for system delay
      const perfTime = midiSignal.timeStamp - LATENCY_MS;

      // 2. Recording Logic
      if (state.current.isRecording) {
        if (isNoteOn) {
          let bestBeatIdx = -1;
          let minDist = Infinity;
          state.current.beatTimes.forEach((bt, idx) => {
            if (idx < timeSig.beats) return; 
            const d = Math.abs(bt.perfTime - perfTime);
            if (d < minDist) { minDist = d; bestBeatIdx = idx - timeSig.beats; }
          });

          if (bestBeatIdx >= 0) {
            const beatDurMs = (60.0 / tempo) * 1000;
            const targetBeatTime = state.current.beatTimes[bestBeatIdx + timeSig.beats].perfTime;
            
            // Calculate rhythm based on denominator (beat value)
            const sixteenthsPerBeat = 16 / timeSig.value;
            const sixteenthDurMs = beatDurMs / sixteenthsPerBeat;
            const rawOffset = perfTime - targetBeatTime;
            const sixteenIdxRaw = Math.round(rawOffset / sixteenthDurMs);
            
            let fBeatIdx = bestBeatIdx, fSixteenIdx = sixteenIdxRaw;
            
            // Normalize grid position
            while (fSixteenIdx >= sixteenthsPerBeat) { fSixteenIdx -= sixteenthsPerBeat; fBeatIdx++; }
            while (fSixteenIdx < 0) { fSixteenIdx += sixteenthsPerBeat; fBeatIdx--; }

            const mIdx = Math.floor(fBeatIdx / timeSig.beats);
            const bIdx = fBeatIdx % timeSig.beats;
            
            activeNotes.current.set(midi, { startTime: perfTime, mIdx, bIdx, sIdx: fSixteenIdx, diffMs: rawOffset - (sixteenIdxRaw * sixteenthDurMs) });
          }
        } else if (isNoteOff) {
          const startData = activeNotes.current.get(midi);
          if (startData) {
            const endTime = perfTime; // Use adjusted time for note off as well
            const beatDurMs = (60.0 / tempo) * 1000;
            const sixteenthsPerBeat = 16 / timeSig.value;
            const sixteenthDurMs = beatDurMs / sixteenthsPerBeat;
            const durMs = endTime - startData.startTime;
            
            const durationSixteenths = Math.max(1, Math.round(durMs / sixteenthDurMs));
            
            if (startData.mIdx >= 0 && startData.mIdx < measures) {
              setRecordedNotes(prev => [...prev, {
                id: Math.random().toString(36).substr(2, 9),
                midi, diffMs: startData.diffMs, measure: startData.mIdx, beatIndex: startData.bIdx, sixteenthIndex: startData.sIdx, durationSixteenths
              }]);
            }
            activeNotes.current.delete(midi);
          }
        }
      }

      return () => clearTimeout(timer);
    }
  }, [midiSignal, timeSig.beats, timeSig.value, measures, tempo, playSynth, isConnected]);

  return (
    <div className="max-w-6xl mx-auto h-full p-6 flex flex-col gap-6 overflow-y-auto bg-black text-slate-100">
      <header className="flex justify-between items-center px-2 shrink-0">
        <div className="flex flex-col">
          <h1 className="text-4xl font-black italic tracking-tighter text-slate-400 uppercase leading-none drop-shadow-[0_0_20px_rgba(100,116,139,0.4)]">PIANO<span className="text-white">TRAINER</span></h1>
          <p className="text-[9px] font-black tracking-[0.5em] text-slate-500 uppercase mt-4">Precision Rhythm Lab</p>
        </div>
        <div className={`flex items-center gap-5 px-7 py-4 rounded-2xl border transition-all duration-150 ${activeInput ? 'bg-slate-500 text-slate-900 scale-105 border-slate-300 shadow-[0_0_30px_#64748b]' : 'bg-slate-900/60 border-slate-800 shadow-2xl text-slate-400'}`}>
           <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${activeInput ? 'bg-slate-900' : (isConnected ? 'bg-green-500 shadow-[0_0_15px_#22c55e]' : 'bg-red-500 shadow-[0_0_15px_#f43f5e]')}`} />
           <span className={`text-[10px] font-black tracking-widest uppercase ${!activeInput && isConnected ? 'text-slate-300' : ''}`}>{activeInput ? 'INPUT DETECTED' : (isConnected ? 'MIDI CONNECTED' : 'NO MIDI DEVICE')}</span>
        </div>
      </header>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex items-center justify-around shadow-2xl shrink-0">
        <div className="relative group">
          <button onClick={onStart} className={`w-32 h-32 rounded-full font-black text-[13px] transition-all active:scale-95 shadow-2xl flex flex-col items-center justify-center tracking-[0.2em] border-[6px] ${isPlaying ? 'bg-rose-600 border-rose-400/50' : 'bg-slate-600 border-slate-400/50'} ${visualBeat ? 'scale-110 shadow-[0_0_30px_rgba(100,116,139,0.4)]' : ''}`}>
            <span>{isPlaying ? (isIntro ? 'READY' : 'STOP') : 'RECORD'}</span>
          </button>
          {isIntro && <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] font-black text-slate-400 tracking-[0.4em] uppercase animate-pulse">{timeSig.beats} Beats Intro</div>}
        </div>
        
        <div className="flex items-center gap-10">
          <div className="text-center">
            <label className="text-[9px] font-black text-slate-600 uppercase block mb-3 tracking-widest">Tempo</label>
            <div className="flex items-center gap-4">
              <button onClick={()=>setTempo(t=>Math.max(40,t-5))} className="w-9 h-9 bg-slate-800 rounded-xl text-lg font-black hover:bg-slate-700 transition-colors">-</button>
              <span className="text-3xl font-mono font-black w-16 tabular-nums">{tempo}</span>
              <button onClick={()=>setTempo(t=>Math.min(240,t+5))} className="w-9 h-9 bg-slate-800 rounded-xl text-lg font-black hover:bg-slate-700 transition-colors">+</button>
            </div>
          </div>

          <div className="text-center">
            <label className="text-[9px] font-black text-slate-600 uppercase block mb-3 tracking-widest">Time Meter</label>
            <div className="flex items-center gap-2">
              <select
                  value={timeSig.beats}
                  onChange={(e) => setTimeSig(prev => ({...prev, beats: parseInt(e.target.value)}))}
                  className="h-9 bg-slate-800 rounded-xl text-sm font-black text-center outline-none border border-slate-700 focus:border-slate-500 text-slate-100"
              >
                  {[1,2,3,4,6,9,12].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-slate-600 font-black">/</span>
              <select
                  value={timeSig.value}
                  onChange={(e) => setTimeSig(prev => ({...prev, value: parseInt(e.target.value)}))}
                  className="h-9 bg-slate-800 rounded-xl text-sm font-black text-center outline-none border border-slate-700 focus:border-slate-500 text-slate-100"
              >
                  {[2,4,8].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="text-center">
            <label className="text-[9px] font-black text-slate-600 uppercase block mb-3 tracking-widest">Measures</label>
            <div className="flex items-center gap-4">
              <button onClick={()=>setMeasures(m=>Math.max(1,m-1))} className="w-9 h-9 bg-slate-800 rounded-xl text-lg font-black hover:bg-slate-700 transition-colors">-</button>
              <span className="text-3xl font-mono font-black w-10 tabular-nums">{measures}</span>
              <button onClick={()=>setMeasures(m=>Math.min(32,m+1))} className="w-9 h-9 bg-slate-800 rounded-xl text-lg font-black hover:bg-slate-700 transition-colors">+</button>
            </div>
          </div>
        </div>
      </div>

      <ScoreDisplay notes={recordedNotes} timeSig={timeSig} measures={measures} isSessionActive={isPlaying} tempo={tempo} onDebugLog={setDebugInfo} />
      <Telemetry notes={recordedNotes} isSessionActive={isPlaying} />
      {debugInfo && (
        <div className="w-full h-48 p-4 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-mono text-slate-400 whitespace-pre-wrap overflow-y-auto shrink-0 mb-3 select-text cursor-text">
          <h3 className="font-bold text-slate-500 mb-2 uppercase tracking-widest">Debug: AlphaTex Generation</h3>
          {debugInfo}
        </div>
      )}
      <footer className="text-center opacity-20 text-[8px] font-black uppercase tracking-[0.6em] pb-3 shrink-0">Engine Core v12.3 • DOM Coloring Strategy Active</footer>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);