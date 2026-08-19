import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';

/**
 * MUSIC DATA & CONFIG
 */

// Mapping for SHARPS mode (Default MIDI numbers to AlphaTex sharp notation)
const MIDI_TO_ALPHATAB_SHARPS: Record<number, string> = {
  // Extended Lower Range
  12: 'c1', 13: 'c#1', 14: 'd1', 15: 'd#1', 16: 'e1', 17: 'f1', 18: 'f#1', 19: 'g1', 20: 'g#1', 21: 'a1', 22: 'a#1', 23: 'b1',
  24: 'c2', 25: 'c#2', 26: 'd2', 27: 'd#2', 28: 'e2', 29: 'f2', 30: 'f#2', 31: 'g2', 32: 'g#2', 33: 'a2', 34: 'a#2', 35: 'b2',
  
  // Original Range
  36: 'c3', 37: 'c#3', 38: 'd3', 39: 'd#3', 40: 'e3', 41: 'f3', 42: 'f#3', 43: 'g3', 44: 'g#3', 45: 'a3', 46: 'a#3', 47: 'b3',
  48: 'c4', 49: 'c#4', 50: 'd4', 51: 'd#4', 52: 'e4', 53: 'f4', 54: 'f#4', 55: 'g4', 56: 'g#4', 57: 'a4', 58: 'a#4', 59: 'b4',
  60: 'c5', 61: 'c#5', 62: 'd5', 63: 'd#5', 64: 'e5', 65: 'f5', 66: 'f#5', 67: 'g5', 68: 'g#5', 69: 'a5', 70: 'a#5', 71: 'b5',
  72: 'c6', 73: 'c#6', 74: 'd6', 75: 'd#6', 76: 'e6', 77: 'f6', 78: 'f#6', 79: 'g6', 80: 'g#6', 81: 'a6', 82: 'a#6', 83: 'b6',
  84: 'c7', 85: 'c#7', 86: 'd7', 87: 'd#7', 88: 'e7', 89: 'f7', 90: 'f#7', 91: 'g7', 92: 'g#7', 93: 'a7', 94: 'a#7', 95: 'b7'
};

// Mapping for FLATS mode (MIDI numbers to AlphaTex flat notation)
const MIDI_TO_ALPHATAB_FLATS: Record<number, string> = {
  // Extended Lower Range
  12: 'c1', 13: 'db1', 14: 'd1', 15: 'eb1', 16: 'e1', 17: 'f1', 18: 'gb1', 19: 'g1', 20: 'ab1', 21: 'a1', 22: 'bb1', 23: 'b1',
  24: 'c2', 25: 'db2', 26: 'd2', 27: 'eb2', 28: 'e2', 29: 'f2', 30: 'gb2', 31: 'g2', 32: 'ab2', 33: 'a2', 34: 'bb2', 35: 'b2',
  
  // Original Range
  36: 'c3', 37: 'db3', 38: 'd3', 39: 'eb3', 40: 'e3', 41: 'f3', 42: 'gb3', 43: 'g3', 44: 'ab3', 45: 'a3', 46: 'bb3', 47: 'b3',
  48: 'c4', 49: 'db4', 50: 'd4', 51: 'eb4', 52: 'e4', 53: 'f4', 54: 'gb4', 55: 'g4', 56: 'ab4', 57: 'a4', 58: 'bb4', 59: 'b4',
  60: 'c5', 61: 'db5', 62: 'd5', 63: 'eb5', 64: 'e5', 65: 'f5', 66: 'gb5', 67: 'g5', 68: 'ab5', 69: 'a5', 70: 'bb5', 71: 'b5',
  72: 'c6', 73: 'db6', 74: 'd6', 75: 'eb6', 76: 'e6', 77: 'f6', 78: 'gb6', 79: 'g6', 80: 'ab6', 81: 'a6', 82: 'bb6', 83: 'b6',
  84: 'c7', 85: 'db7', 86: 'd7', 87: 'eb7', 88: 'e7', 89: 'f7', 90: 'gb7', 91: 'g7', 92: 'ab7', 93: 'a7', 94: 'bb7', 95: 'b7'
};

export interface KeySigDef {
  code: string;
  label: string;
  type: 'natural' | 'sharps' | 'flats';
}

// 12/15 standard key signatures sorted by number of symbols (0 first, then 1, 2, 3...)
export const KEY_SIGNATURES: KeySigDef[] = [
  { code: 'c',  label: 'Cmaj/Amin', type: 'natural' },
  { code: 'f',  label: '1b - Fmaj/Dmin', type: 'flats' },
  { code: 'g',  label: '1# - Gmaj/Emin', type: 'sharps' },
  { code: 'bb', label: '2b - Bbmaj/Gmin', type: 'flats' },
  { code: 'd',  label: '2# - Dmaj/Bmin', type: 'sharps' },
  { code: 'eb', label: '3b - Ebmaj/Cmin', type: 'flats' },
  { code: 'a',  label: '3# - Amaj/F#min', type: 'sharps' },
  { code: 'ab', label: '4b - Abmaj/Fmin', type: 'flats' },
  { code: 'e',  label: '4# - Emaj/C#min', type: 'sharps' },
  { code: 'db', label: '5b - Dbmaj/Bbmin', type: 'flats' },
  { code: 'b',  label: '5# - Bmaj/G#min', type: 'sharps' },
  { code: 'gb', label: '6b - Gbmaj/Ebmin', type: 'flats' },
  { code: 'f#', label: '6# - F#maj/D#min', type: 'sharps' },
  { code: 'cb', label: '7b - Cbmaj/Abmin', type: 'flats' },
  { code: 'c#', label: '7# - C#maj/A#min', type: 'sharps' },
];

const STORAGE_KEY = 'piano_trainer_config_v2';

const loadSavedConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load saved configuration from localStorage", e);
  }
  return null;
};

const KBD_MAP: Record<string, number> = {
  'a': 48, 's': 50, 'd': 52, 'f': 53, 'g': 55, 'h': 57, 'j': 59, 'k': 60, 'l': 62, ';': 64,
  'q': 60, 'w': 62, 'e': 64, 'r': 65, 't': 67, 'y': 69, 'u': 71, 'i': 72, 'o': 74, 'p': 76
};

const DURATION_MAP: Record<number, string> = {
  1: '16', 2: '8', 4: '4', 8: '2', 16: '1'
};

const DEFAULT_PERFECT_WINDOW_MS = 35; // Default window in ms (middle value on sensitivity slider)

const SEMITONES_LOOKUP: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11
};

export const parseNoteNameToMidi = (noteStr: string): number | null => {
  if (!noteStr || typeof noteStr !== 'string') return null;
  const match = noteStr.trim().toLowerCase().match(/^([a-g])([#b♯♭]?)(-?\d+)$/);
  if (!match) return null;
  
  const letter = match[1];
  const accidental = match[2];
  const octave = parseInt(match[3], 10);
  
  if (isNaN(octave) || octave < 0 || octave > 8) return null;
  
  let semitone = SEMITONES_LOOKUP[letter];
  if (accidental === '#' || accidental === '♯') semitone += 1;
  else if (accidental === 'b' || accidental === '♭') semitone -= 1;
  
  // In our score notation system, C4 (Middle C) = 48
  const midi = (octave * 12) + semitone;
  if (midi < 0 || midi > 127) return null;
  return midi;
};

const getTimingColorHex = (diffMs: number, toleranceMs: number = DEFAULT_PERFECT_WINDOW_MS): string => {
  if (Math.abs(diffMs) < toleranceMs) return '#64748b'; // Slate (Perfect)
  if (diffMs < 0) return '#3b82f6'; // Blue (Early)
  return '#f43f5e'; // Rose (Late)
};

const getTimingLabel = (diffMs: number, toleranceMs: number = DEFAULT_PERFECT_WINDOW_MS): string => {
  if (Math.abs(diffMs) < toleranceMs) return 'PERFECT';
  return diffMs < 0 ? `${Math.abs(Math.round(diffMs))}ms EARLY` : `${Math.round(diffMs)}ms LATE`;
};

const useMidi = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [midiSignal, setMidiSignal] = useState<{data: number[], timeStamp: number, source: 'midi' | 'keyboard'} | null>(null);
  const [midiSupported, setMidiSupported] = useState(false);
  const [midiAccess, setMidiAccess] = useState<any>(null);

  useEffect(() => {
    // Check for MIDI support safely
    if ((navigator as any).requestMIDIAccess) {
      setMidiSupported(true);
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

const connectMidi = useCallback(async () => {
    if (!(navigator as any).requestMIDIAccess) {
      alert("MIDI API not found in this browser.");
      return;
    }

    try {
      // 1. Force sysex: true - required for many iPad MIDI shims to "see" USB devices
      const access = await (navigator as any).requestMIDIAccess({ sysex: true });
      setMidiAccess(access);
      console.log("MIDI Access Granted");

      const onMessage = (msg: any) => {
        const data = Array.from(msg.data) as number[];
        // Filter out MIDI Clock (248), Active Sensing (254), and other system messages (>= 240)
        if (data[0] >= 240) return;
        setMidiSignal({ data, timeStamp: performance.now(), source: 'midi' });
      };

      const updateInputs = () => {
        const inputs: any[] = [];
        // Use forEach instead of Array.from(values()) for older iPad browser compatibility
        access.inputs.forEach((input: any) => {
          input.onmidimessage = onMessage;
          inputs.push(input);
        });
        
        console.log("Detected MIDI inputs:", inputs.length);
        setIsConnected(inputs.length > 0);
      };

      // 2. Listen for future plugs/unplugs
      access.onstatechange = updateInputs;

      // 3. Run immediately, then again in 200ms to catch "late" shim initialization
      updateInputs();
      setTimeout(updateInputs, 200);

    } catch (e: any) {
      console.error("MIDI Access Failed", e);
      alert("MIDI Connection failed. Please ensure 'SysEx' is enabled in your browser settings.");
    }
  }, [setMidiSignal]);

  return { isConnected, midiSignal, midiSupported, midiAccess, connectMidi };
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

const ScoreDisplay = ({ notes, timeSig, measures, isSessionActive, tempo, keySignature, accidentalMode, toleranceMs, onDebugLog }: { notes: RecordedNote[], timeSig: {beats: number, value: number}, measures: number, isSessionActive: boolean, tempo: number, keySignature: string, accidentalMode: 'flats' | 'sharps', toleranceMs: number, onDebugLog?: React.Dispatch<React.SetStateAction<string>> }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  const metadataRef = useRef<any[]>([]);
  const isSessionActiveRef = useRef(isSessionActive);
  const toleranceMsRef = useRef(toleranceMs);
  const onDebugLogRef = useRef(onDebugLog);

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  useEffect(() => {
    toleranceMsRef.current = toleranceMs;
  }, [toleranceMs]);
  
  useEffect(() => {
    onDebugLogRef.current = onDebugLog;
  }, [onDebugLog]);

  const buildTex = useCallback((recordedNotes: RecordedNote[]) => {
    // Dynamic map selection based on key signature preference
    const noteMap = accidentalMode === 'flats' ? MIDI_TO_ALPHATAB_FLATS : MIDI_TO_ALPHATAB_SHARPS;

    // 1. Set headers to empty strings
    // 2. Add \track " " to override the default "Guitar" name
    // 3. Add \tuning none to hide the tuning description
    // 4. Add \ks <keySignature> for automatic key signature symbols on staff
    let tex = `\\title "" \\subtitle "" \\artist "" \\album "" \\words "" \\music "" \\copyright "" \r\n`;
    tex += `\\track " " \r\n`; 
    tex += `\\tuning none \r\n`; 
    tex += `\\tempo ${tempo}\r\n`;
    tex += `\\ts ${timeSig.beats} ${timeSig.value} \\clef treble \\ks ${keySignature} `; 

    const sixteenthsPerBeat = 16 / timeSig.value;
    const measureSixteenths = timeSig.beats * sixteenthsPerBeat;
    const totalSixteenths = measures * measureSixteenths;
    const texMetadata: any[] = [];

    // 1. Sort notes by time for linear processing
    const getNotePos = (n: RecordedNote) => (n.measure * measureSixteenths) + (n.beatIndex * sixteenthsPerBeat) + n.sixteenthIndex;
    const sortedNotes = [...recordedNotes].sort((a, b) => getNotePos(a) - getNotePos(b));

    let currentSixteenth = 0;
    
    // 2. Linear scan of the entire timeline
    while (currentSixteenth < totalSixteenths) {
      const inMeasureIdx = currentSixteenth % measureSixteenths;
      const remainingInMeasure = measureSixteenths - inMeasureIdx;
      
      // Check for note(s) starting exactly at this slot
      const startsAtSlot = sortedNotes.filter(n => Math.abs(getNotePos(n) - currentSixteenth) < 0.1);

      if (startsAtSlot.length > 0) {
        // --- NOTE DETECTED ---
        const rawDur = Math.max(...startsAtSlot.map(n => n.durationSixteenths));
        
        // We ensure we don't cross bar lines (remainingInMeasure)
        const maxDur = Math.min(rawDur, remainingInMeasure); 

        // Snap to largest standard duration
        let writeDur = 1;
        const allowed = [16, 8, 4, 2, 1];
        for (const d of allowed) {
            if (d <= maxDur) {
                writeDur = d;
                break;
            }
        }
        
        // Render Note
        const rhythm = DURATION_MAP[writeDur] || '16';
        if (startsAtSlot.length === 1) {
          const noteName = noteMap[startsAtSlot[0].midi] || 'c4';
          tex += `${noteName}.${rhythm} `;
        } else {
          tex += "(";
          startsAtSlot.forEach((h, idx) => {
            const noteName = noteMap[h.midi] || 'c4';
            tex += `${noteName}${idx === startsAtSlot.length - 1 ? '' : ' '}`;
          });
          tex += ").";
          tex += `${rhythm} `;
        }
        
        texMetadata.push({ hits: startsAtSlot });
        currentSixteenth += writeDur;

      } else {
        // --- NO NOTE (REST NEEDED) ---
        // Calculate gap size until next note or end of measure
        const nextNote = sortedNotes.find(n => getNotePos(n) > currentSixteenth + 0.1);
        const available = Math.min(nextNote ? getNotePos(nextNote) - currentSixteenth : totalSixteenths - currentSixteenth, remainingInMeasure);

        // Find largest rest that fits
        let writeDur = 1;
        const allowed = [16, 8, 4, 2, 1];
        for (const d of allowed) {
            if (d <= available) {
                writeDur = d;
                break;
            }
        }

        const rhythm = DURATION_MAP[writeDur] || '16';
        tex += `r.${rhythm} `;
        texMetadata.push({ hits: null });
        currentSixteenth += writeDur;
      }

      // Add bar lines
      if (currentSixteenth > 0 && currentSixteenth % measureSixteenths === 0) {
        tex += "| ";
      }
    }

    return { tex, texMetadata };
  }, [timeSig.beats, timeSig.value, measures, tempo, keySignature, accidentalMode]);

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
          layoutMode: 'page',
          scale: 1.45,
          padding: [24, 24, 24, 24],
          resources: { 
            staffLineColor: '#cbd5e1', 
            mainColor: '#1e293b',
            secondaryColor: '#64748b'
          }
        },
        layout: {
          hideTuning: true,
          hideTrackNames: true
        }
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
                          const currentTolerance = toleranceMsRef.current;
                          const colorHex = getTimingColorHex(diffMs, currentTolerance);
                          const r = parseInt(colorHex.slice(1, 3), 16);
                          const g = parseInt(colorHex.slice(3, 5), 16);
                          const b = parseInt(colorHex.slice(5, 7), 16);
                          
                          try {
                            const color = new Color(r, g, b, 255);

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
                            const status = Math.abs(diffMs) < currentTolerance ? 'PERFECT' : diffMs < 0 ? 'EARLY' : 'LATE';
                            colorDebugLog += `Note #${globalIndex} (Bar ${bar.index !== undefined ? bar.index + 1 : '?'}) [${diffMs > 0 ? '+' : ''}${Math.round(diffMs)}ms] [${status} (±${currentTolerance}ms)] -> ${colorHex}\n`;
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
    
    // Only log AlphaTex generation if we actually have notes to display, 
    // effectively silencing this log during calibration/latency tests which have 0 notes.
    if (onDebugLog && notes.length > 0) {
      onDebugLog(`Generated AlphaTex:\n${tex}\n\nMetadata Slots: ${texMetadata.length}`);
    }

    try {
      apiRef.current.tex(tex);
    } catch (e) {
      console.error("Render failed", e);
    }
  }, [notes, isSessionActive, timeSig.beats, timeSig.value, measures, error, buildTex, tempo, onDebugLog, keySignature, accidentalMode, toleranceMs]);

  const currentKeyInfo = KEY_SIGNATURES.find(k => k.code === keySignature);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative flex flex-col shrink-0">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 shrink-0 px-2">
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Practice Analysis</h2>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">
            Tempo: {tempo} BPM • Meter: {timeSig.beats}/{timeSig.value} • Key: {currentKeyInfo?.label || 'Cmaj/Amin'} • Accuracy: ±{toleranceMs}ms
          </p>
        </div>
        
        {isSessionActive ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            RECORDING LIVE
          </div>
        ) : (
          notes.length > 0 && (
            <div className="flex gap-4">
               <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6]" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Early</span></div>
               <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-slate-500 border border-slate-500 rounded-full" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Perfect (±{toleranceMs}ms)</span></div>
               <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-500 rounded-full shadow-[0_0_8px_#f43f5e]" /><span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Late</span></div>
            </div>
          )
        )}
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 relative shadow-inner p-4 min-h-[300px]">
        {error ? (
          <div className="text-center p-8">
            <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Restart Engine</button>
          </div>
        ) : (
          <div ref={containerRef} className="alphaTab-container w-full min-h-[260px] overflow-x-auto overflow-y-visible" />
        )}
      </div>
    </div>
  );
};

const Telemetry = ({ notes, isSessionActive, toleranceMs }: { notes: RecordedNote[], isSessionActive: boolean, toleranceMs: number }) => {
  const [isOpen, setIsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [notes, isOpen]);

  return (
    <div className={`bg-slate-950 border transition-all duration-300 rounded-3xl flex flex-col overflow-hidden shadow-2xl shrink-0 ${isSessionActive ? 'border-slate-500/40' : 'border-slate-800'}`}>
      <button 
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full px-6 py-4 flex justify-between items-center bg-slate-900/50 hover:bg-slate-900/80 transition-colors text-left select-none focus:outline-none cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-xs font-mono transition-transform duration-200 inline-block" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Live Telemetry</h3>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-bold border border-slate-700">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {isSessionActive && (
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-ping" /> Synchronized Feed
            </span>
          )}
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
            {isOpen ? 'Collapse' : 'Expand'}
          </span>
        </div>
      </button>

      {isOpen && (
        <div ref={listRef} className="max-h-64 overflow-y-auto p-4 space-y-1.5 font-mono text-[11px] border-t border-slate-800/80">
          {notes.length === 0 ? (
            <div className="py-8 flex items-center justify-center opacity-30">
              <p className="font-black text-slate-700 uppercase tracking-[0.5em]">System Idle</p>
            </div>
          ) : (
            notes.map(n => (
              <div key={n.id} className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800/60 transition-all hover:bg-slate-800/40 animate-in fade-in slide-in-from-right-2">
                 <div className="flex items-center gap-6">
                    <div className="w-12 h-6 flex items-center justify-center bg-slate-800 rounded-md text-slate-500 font-bold border border-slate-700 text-[9px]">MIDI {n.midi}</div>
                    <span className={`font-black tracking-wider w-32 ${Math.abs(n.diffMs) < toleranceMs ? 'text-slate-500' : n.diffMs < 0 ? 'text-blue-400' : 'text-rose-500'}`}>{getTimingLabel(n.diffMs, toleranceMs)}</span>
                 </div>
                 <span className="text-[9px] text-slate-600 font-black uppercase">Bar {n.measure+1} • Pos {n.beatIndex+1}.{n.sixteenthIndex+1}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const DebugPanel = ({ debugInfo }: { debugInfo: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!debugInfo) return null;

  return (
    <div className="w-full bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shrink-0 shadow-2xl">
      <button 
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full px-6 py-4 flex justify-between items-center bg-slate-900/50 hover:bg-slate-900/80 transition-colors text-left select-none focus:outline-none cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-xs font-mono transition-transform duration-200 inline-block" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Debug: AlphaTex & Engine Logs</h3>
        </div>
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
          {isOpen ? 'Collapse' : 'Expand'}
        </span>
      </button>
      
      {isOpen && (
        <div className="p-4 text-[10px] font-mono text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto border-t border-slate-800 select-text cursor-text bg-slate-950/60">
          {debugInfo}
        </div>
      )}
    </div>
  );
};

const InstructionsModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-sm">
              ?
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Piano Trainer Instructions</h2>
              <p className="text-[10px] text-slate-400 font-mono">Precision Rhythm & Timing Laboratory</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition-colors border border-slate-700"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 text-xs leading-relaxed font-sans">
          
          {/* 1. Goal */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">1. Goal & Capabilities</h3>
            </div>
            <p className="text-slate-400 pl-4">
              The goal is to help you <strong className="text-slate-200">visualize and improve your millisecond rhythmic precision</strong>. It captures your live keyboard performance, accurately aligns it against a sixteenth-note metronome grid, and instantly transcribes the performance into professional musical notation with millisecond-level timing analysis.
            </p>
          </section>

          {/* 2. Needed Equipment */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">2. Needed Equipment</h3>
            </div>
            <ul className="list-disc list-inside text-slate-400 pl-4 space-y-1">
              <li><strong className="text-slate-200">MIDI Keyboard / Digital Piano</strong>: Connected via USB or Bluetooth MIDI.</li>
              <li><strong className="text-slate-200">Computer Keyboard (Fallback)</strong>: QWERTY keys (<code className="bg-slate-800 px-1.5 py-0.5 rounded text-[11px] text-slate-300">A, W, S, E, D, F...</code> or <code className="bg-slate-800 px-1.5 py-0.5 rounded text-[11px] text-slate-300">Q, W, E, R, T...</code>) can be used to trigger notes without external hardware.</li>
              <li><strong className="text-slate-200">Modern Web Browser (non-iPad)</strong>: Chrome, Edge, Brave, or Opera (supporting Web MIDI API).</li>
              <li><strong className="text-slate-200">iPad Users</strong>: Standard iPad browsers (Safari, Chrome on iPadOS) do not support Web MIDI because Apple blocks it, so the app will not work in them. You must install and run the app inside the <a href="https://apps.apple.com/us/app/web-midi-browser/id953846217" target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300 font-bold">Web MIDI Browser</a> app.</li>
            </ul>
          </section>

          {/* 3. How to Connect */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">3. How to Connect</h3>
            </div>
            <ol className="list-decimal list-inside text-slate-400 pl-4 space-y-1.5">
              <li>Connect your digital piano or MIDI controller to your computer with a USB cable.</li>
              <li>Click the <strong className="text-slate-200">"Connect MIDI Keyboard"</strong> button located in the top-right header.</li>
              <li>When prompted by the browser, click <strong className="text-slate-200">"Allow"</strong> to grant MIDI device permissions.</li>
              <li>The header status badge will switch to <span className="text-emerald-400 font-bold">"MIDI CONNECTED"</span> and glow whenever you press a key.</li>
            </ol>
          </section>

          {/* 4. How to Setup & Latency Test */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">4. Setup & Latency Calibration</h3>
            </div>
            <p className="text-slate-400 pl-4">
              All audio outputs introduce slight physical delays. Calibrate once before practice:
            </p>
            <ol className="list-decimal list-inside text-slate-400 pl-4 space-y-1.5">
              <li>Click the <strong className="text-slate-200">"Test Latency"</strong> button on the control bar.</li>
              <li>The tempo automatically locks to <strong className="text-slate-200">100 BPM</strong> with a 1-measure count-in.</li>
              <li>Tap any piano key in exact synchronization with the metronome clicks.</li>
              <li>The calculation happens automatically after the set measures, saving your hardware delay offset (ms) and restoring your previous tempo.</li>
              <li><strong className="text-slate-200">Accuracy Slider</strong>: Located directly under the Tempo control to adjust your difficulty threshold (default <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">±35ms</code>, or down to <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">±5ms</code> for strict precision).</li>
            </ol>
          </section>

          {/* 5. How to Use */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">5. How to Practice & Read Feedback</h3>
            </div>
            <ul className="text-slate-400 pl-4 space-y-2">
              <li><strong className="text-slate-200">Set Configuration</strong>: Pick your desired <strong>Tempo</strong>, <strong>Time Meter</strong>, <strong>Key Signature</strong>, <strong>Measures</strong>, and <strong>Min Note cutoff</strong> (defaults to C4 to ignore left-hand notes below Middle C). All settings save automatically.</li>
              <li><strong className="text-slate-200">Record</strong>: Press the large <strong className="text-slate-200">RECORD</strong> button. Listen to the 1-bar intro count-in, then play your musical phrase.</li>
              <li><strong className="text-slate-200">Review Score Notation</strong>: Press <strong className="text-slate-200">STOP</strong> (or complete all measures). Your performance is transcribed directly onto the musical score with color-coded feedback:
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
                  <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-center">
                    <span className="text-slate-400 font-bold block mb-0.5">SLATE / NEUTRAL</span>
                    <span className="text-slate-300">Perfect Timing</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/80 border border-blue-500/40 text-center">
                    <span className="text-blue-400 font-bold block mb-0.5">BLUE</span>
                    <span className="text-slate-300">Early (Rushed)</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/80 border border-rose-500/40 text-center">
                    <span className="text-rose-400 font-bold block mb-0.5">ROSE / RED</span>
                    <span className="text-slate-300">Late (Dragged)</span>
                  </div>
                </div>
              </li>
              <li><strong className="text-slate-200">Detailed Telemetry</strong>: Expand the collapsible <strong className="text-slate-200">Live Telemetry</strong> bar at the bottom to inspect millisecond accuracy for every individual note.</li>
            </ul>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const savedConfig = useRef(loadSavedConfig()).current;

  const [tempo, setTempo] = useState<number>(savedConfig?.tempo ?? 100);
  const [timeSig, setTimeSig] = useState<{ beats: number; value: number }>(savedConfig?.timeSig ?? { beats: 4, value: 4 });
  const [measures, setMeasures] = useState<number>(savedConfig?.measures ?? 4);
  const [latencyMs, setLatencyMs] = useState<number>(savedConfig?.latencyMs ?? 0);
  const [keySignature, setKeySignature] = useState<string>(() => {
    return savedConfig?.keySignature && KEY_SIGNATURES.some(k => k.code === savedConfig.keySignature)
      ? savedConfig.keySignature
      : 'c';
  });
  const [toleranceMs, setToleranceMs] = useState<number>(savedConfig?.toleranceMs ?? 35);
  const [minNote, setMinNote] = useState<string>(savedConfig?.minNote ?? 'C4');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isIntro, setIsIntro] = useState(false);
  const [recordedNotes, setRecordedNotes] = useState<RecordedNote[]>([]);
  const [visualBeat, setVisualBeat] = useState(false);
  const [activeInput, setActiveInput] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const isLatencyTesting = useRef(false);
  const savedTempoForLatencyTest = useRef<number | null>(null);
  const sessionNotesRef = useRef<RecordedNote[]>([]); // Track all notes for calculation

  const currentKeyDef = KEY_SIGNATURES.find(k => k.code === keySignature) || KEY_SIGNATURES[0];
  const accidentalMode = currentKeyDef.type === 'flats' ? 'flats' : 'sharps';

  const { isConnected, midiSignal, midiSupported, midiAccess, connectMidi } = useMidi();
  const audioCtx = useRef<AudioContext | null>(null);
  const metTimer = useRef<any>(null);
  const activeNotes = useRef<Map<number, any>>(new Map());

  const tempoRef = useRef(tempo);
  const timeSigRef = useRef(timeSig);
  const measuresRef = useRef(measures);
  const minNoteRef = useRef(minNote);
  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { timeSigRef.current = timeSig; }, [timeSig]);
  useEffect(() => { measuresRef.current = measures; }, [measures]);
  useEffect(() => { minNoteRef.current = minNote; }, [minNote]);

  // Save config to localStorage whenever user changes settings
  useEffect(() => {
    if (isLatencyTesting.current) return;
    try {
      const configToSave = { tempo, timeSig, measures, latencyMs, keySignature, toleranceMs, minNote };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
    } catch (e) {
      console.warn("Failed to save config to localStorage", e);
    }
  }, [tempo, timeSig, measures, latencyMs, keySignature, toleranceMs, minNote]);

  const state = useRef({
    nextNoteTime: 0,
    currentBeat: 0,
    measureCount: 0,
    isRecording: false,
    beatTimes: [] as { audioTime: number, perfTime: number }[],
  });

  const stop = useCallback(() => {
    if (metTimer.current) clearTimeout(metTimer.current);

    // Flush any active notes that are still held down
    const now = performance.now();
    const flushedNotes: RecordedNote[] = [];
    const beatDurMs = (60.0 / tempoRef.current) * 1000;
    const sixteenthsPerBeat = 16 / timeSigRef.current.value;
    const sixteenthDurMs = beatDurMs / sixteenthsPerBeat;

    activeNotes.current.forEach((startData, midi) => {
      // Force end time to now
      const endTime = now - latencyMs;
      const durMs = endTime - startData.startTime;
      const durationSixteenths = Math.max(1, Math.round(durMs / sixteenthDurMs));
      
      if (startData.mIdx >= 0 && startData.mIdx < measuresRef.current) {
         const newNote = {
            id: Math.random().toString(36).substr(2, 9),
            midi,
            diffMs: startData.diffMs,
            measure: startData.mIdx,
            beatIndex: startData.bIdx,
            sixteenthIndex: startData.sIdx,
            durationSixteenths
         };
         flushedNotes.push(newNote);
         sessionNotesRef.current.push(newNote);
      }
    });
    
    // Only update visual notes if NOT in latency test mode
    if (flushedNotes.length > 0 && !isLatencyTesting.current) {
      setRecordedNotes(prev => [...prev, ...flushedNotes]);
    }
    activeNotes.current.clear();

    if (isLatencyTesting.current) {
       if (sessionNotesRef.current.length > 0) {
           const sum = sessionNotesRef.current.reduce((acc, n) => acc + n.diffMs, 0);
           const avg = sum / sessionNotesRef.current.length;
           const newLatency = Math.round(avg);
           setLatencyMs(newLatency);
           setDebugInfo(`[Calibration] Latency Test Complete.\nDetected Avg Offset: ${avg.toFixed(2)}ms\nNew Latency Compensation: ${newLatency}ms\nRestored original tempo: ${savedTempoForLatencyTest.current ?? tempo} BPM\n`);
       } else {
           setDebugInfo(`[Calibration] Failed: No notes detected.\nRestored original tempo: ${savedTempoForLatencyTest.current ?? tempo} BPM\n`);
       }
       isLatencyTesting.current = false;
       // Restore saved tempo from before latency test
       if (savedTempoForLatencyTest.current !== null) {
         setTempo(savedTempoForLatencyTest.current);
         savedTempoForLatencyTest.current = null;
       }
    }

    setIsPlaying(false);
    setIsIntro(false);
    state.current.isRecording = false;
  }, [latencyMs, tempo]);

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
      // Check if we have finished all measures (measureCount starts at 0 for bar 1)
      // We add 1 to account for the mandatory intro bar.
      if (state.current.measureCount >= measuresRef.current + 1) {
        setTimeout(stop, 500);
        return;
      }

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
      }
    }
    metTimer.current = setTimeout(tick, 25);
  }, [stop]);

  const onStart = () => {
    if (isPlaying) { stop(); return; }

    // Validate minNote before starting recording
    const cutoffMidi = parseNoteNameToMidi(minNote);
    if (cutoffMidi === null) {
      setValidationError(`Invalid lowest note "${minNote}". Enter a valid note like C4, F#3, or Bb3.`);
      return;
    }
    setValidationError(null);

    audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume();
    state.current = { nextNoteTime: audioCtx.current.currentTime + 0.1, currentBeat: 0, measureCount: 0, isRecording: false, beatTimes: [] };
    setRecordedNotes([]);
    sessionNotesRef.current = [];
    setIsPlaying(true); setIsIntro(true); tick();
  };

  const testLatency = () => {
    if (isPlaying) stop();
    // Save current tempo before starting test at standard 100 BPM
    savedTempoForLatencyTest.current = tempo;
    setTempo(100);
    setMeasures(4);
    setTimeSig({ beats: 4, value: 4 });
    setLatencyMs(0); 
    isLatencyTesting.current = true;
    setDebugInfo(`[Calibration] Starting Latency Test at 100 BPM...\n(Original tempo ${tempo} BPM saved; will restore after test)\nPlease tap/play exactly on the metronome click for 4 bars.`);
    
    // Defer start slightly to allow state updates to settle if any refs depend on them immediately
    setTimeout(() => onStart(), 100);
  };

  useEffect(() => {
    if (midiSignal) {
      const [statusByte, rawMidi, vel] = midiSignal.data;
      
      // Real MIDI devices send Middle C as 60. In our AlphaTex table, C4 is 48.
      // rawMidi - 12 maps Middle C (60) to 48 (C4).
      const midi = midiSignal.source === 'midi' ? rawMidi - 12 : rawMidi;

      // Filter out notes below minNote cutoff if valid (makes them completely transparent to the app)
      const cutoffMidi = parseNoteNameToMidi(minNoteRef.current);
      if (cutoffMidi !== null && midi < cutoffMidi) {
        return;
      }

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
      // Use state latencyMs
      const perfTime = midiSignal.timeStamp - latencyMs;

      // 2. Recording Logic
      if (state.current.isRecording && isNoteOn) {
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
      } 
      
      // Process Note OFF even if recording just stopped, to capture tail notes
      if (isNoteOff) {
          const startData = activeNotes.current.get(midi);
          if (startData) {
            const endTime = perfTime; 
            const beatDurMs = (60.0 / tempo) * 1000;
            const sixteenthsPerBeat = 16 / timeSig.value;
            const sixteenthDurMs = beatDurMs / sixteenthsPerBeat;
            const durMs = endTime - startData.startTime;
            
            const durationSixteenths = Math.max(1, Math.round(durMs / sixteenthDurMs));
            
            if (startData.mIdx >= 0 && startData.mIdx < measures) {
              const newNote = {
                id: Math.random().toString(36).substr(2, 9),
                midi, diffMs: startData.diffMs, measure: startData.mIdx, beatIndex: startData.bIdx, sixteenthIndex: startData.sIdx, durationSixteenths
              };
              // Only add to visual staff if NOT testing latency
              if (!isLatencyTesting.current) {
                setRecordedNotes(prev => [...prev, newNote]);
              }
              sessionNotesRef.current.push(newNote);
            }
            activeNotes.current.delete(midi);
          }
      }

      return () => clearTimeout(timer);
    }
  }, [midiSignal, timeSig.beats, timeSig.value, measures, tempo, playSynth, isConnected, latencyMs, minNote]);

  return (
    <div className="max-w-6xl mx-auto h-full p-6 flex flex-col gap-6 overflow-y-auto bg-black text-slate-100">
      <header className="flex justify-between items-center px-2 shrink-0">
        <div className="flex flex-col">
          <h1 className="text-4xl font-black italic tracking-tighter text-slate-400 uppercase leading-none drop-shadow-[0_0_20px_rgba(100,116,139,0.4)]">PIANO<span className="text-white">TRAINER</span></h1>
          <p className="text-[9px] font-black tracking-[0.5em] text-slate-500 uppercase mt-4">Precision Rhythm Lab</p>
        </div>
        
        <div className="flex items-center gap-3">
            <button
              onClick={() => setShowInstructions(true)}
              className="px-4 py-4 rounded-2xl font-black text-[10px] tracking-widest uppercase shadow-2xl transition-all active:scale-95 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-600 flex items-center gap-2"
              title="View guide and instructions"
            >
              <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold border border-slate-700">?</span>
              Instructions
            </button>

            {!midiAccess && (
              <button 
                onClick={connectMidi} 
                disabled={!midiSupported}
                className={`px-6 py-4 rounded-2xl font-black text-[10px] tracking-widest uppercase shadow-2xl transition-all active:scale-95 ${midiSupported ? 'bg-slate-700 hover:bg-slate-600 text-white shadow-[0_0_20px_rgba(71,85,105,0.4)]' : 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800'}`}
              >
                {midiSupported ? "Connect MIDI Keyboard" : "MIDI Not Supported"}
              </button>
            )}

            {(midiAccess || activeInput) && (
              <div className={`flex items-center gap-5 px-7 py-4 rounded-2xl border transition-all duration-150 ${activeInput ? 'bg-slate-500 text-slate-900 scale-105 border-slate-300 shadow-[0_0_30px_#64748b]' : 'bg-slate-900/60 border-slate-800 shadow-2xl text-slate-400'}`}>
                 <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${activeInput ? 'bg-slate-900' : (isConnected ? 'bg-green-500 shadow-[0_0_15px_#22c55e]' : 'bg-red-500 shadow-[0_0_15px_#f43f5e]')}`} />
                 <span className={`text-[10px] font-black tracking-widest uppercase ${!activeInput && isConnected ? 'text-slate-300' : ''}`}>
                    {activeInput ? 'INPUT DETECTED' : (isConnected ? 'MIDI CONNECTED' : 'NO MIDI DEVICE')}
                 </span>
              </div>
            )}
        </div>
      </header>

      {validationError && (
        <div className="w-full bg-rose-950/90 border border-rose-500/70 text-rose-200 text-xs px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-2xl shrink-0 animate-pulse">
          <span className="font-bold">⚠️ {validationError}</span>
          <button onClick={() => setValidationError(null)} className="text-rose-400 hover:text-white font-black text-xs px-2 py-1 bg-rose-900/50 rounded-lg">✕</button>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 sm:gap-6 shadow-2xl shrink-0">
        <div className="relative group shrink-0">
          <button onClick={onStart} className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full font-black text-[12px] sm:text-[13px] transition-all active:scale-95 shadow-2xl flex flex-col items-center justify-center tracking-[0.2em] border-[6px] ${isPlaying ? 'bg-rose-600 border-rose-400/50' : 'bg-slate-600 border-slate-400/50'} ${visualBeat ? 'scale-110 shadow-[0_0_30px_rgba(100,116,139,0.4)]' : ''}`}>
            <span>{isPlaying ? (isIntro ? 'READY' : 'STOP') : 'RECORD'}</span>
          </button>
          {isIntro && <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[9px] font-black text-slate-400 tracking-[0.3em] uppercase animate-pulse whitespace-nowrap">{timeSig.beats} Beats Intro</div>}
        </div>
        
        <div className="flex flex-wrap items-start justify-center sm:justify-end gap-4 sm:gap-6 flex-1">
          {/* Column 1: Tempo (top) & Accuracy Slider (under tempo) */}
          <div className="flex flex-col items-center min-w-[130px]">
            <label className="text-[9px] font-black text-slate-600 uppercase block mb-1.5 tracking-widest">Tempo</label>
            <div className="flex items-center gap-1.5">
              <button onClick={()=>setTempo(t=>Math.max(40,t-5))} className="w-8 h-8 bg-slate-800 rounded-lg text-base font-black hover:bg-slate-700 active:scale-95 transition-all text-slate-200">-</button>
              <span className="text-2xl sm:text-3xl font-mono font-black w-12 text-center tabular-nums">{tempo}</span>
              <button onClick={()=>setTempo(t=>Math.min(240,t+5))} className="w-8 h-8 bg-slate-800 rounded-lg text-base font-black hover:bg-slate-700 active:scale-95 transition-all text-slate-200">+</button>
            </div>
            
            {/* Accuracy slider placed directly under tempo */}
            <div className="mt-3 flex flex-col items-center w-full">
              <div className="flex justify-between items-center w-full px-0.5 mb-1">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Accuracy</label>
                <span className="text-[9px] font-mono font-bold text-slate-300">±{toleranceMs}ms</span>
              </div>
              <div className="flex items-center gap-1.5 w-full justify-center">
                <span className="text-[7px] font-bold text-slate-500 uppercase">±5ms</span>
                <input 
                  type="range" 
                  min="5" 
                  max="65" 
                  step="1"
                  value={toleranceMs}
                  onChange={(e) => setToleranceMs(parseInt(e.target.value))}
                  className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-400 focus:outline-none"
                  title={`Timing accuracy threshold: ±${toleranceMs}ms (Middle: 35ms)`}
                />
                <span className="text-[7px] font-bold text-slate-500 uppercase">±65ms</span>
              </div>
            </div>
          </div>

          {/* Column 2: Time Meter (top) & Min Note cutoff (under time meter) */}
          <div className="flex flex-col items-center min-w-[120px]">
            <label className="text-[9px] font-black text-slate-600 uppercase block mb-1.5 tracking-widest">Time Meter</label>
            <div className="flex items-center gap-1.5">
              <select
                  value={timeSig.beats}
                  onChange={(e) => setTimeSig(prev => ({...prev, beats: parseInt(e.target.value)}))}
                  className="h-8 px-2 bg-slate-800 rounded-lg text-xs font-black text-center outline-none border border-slate-700 focus:border-slate-500 text-slate-100 cursor-pointer"
              >
                  {[1,2,3,4,6,9,12].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-slate-600 font-black">/</span>
              <select
                  value={timeSig.value}
                  onChange={(e) => setTimeSig(prev => ({...prev, value: parseInt(e.target.value)}))}
                  className="h-8 px-2 bg-slate-800 rounded-lg text-xs font-black text-center outline-none border border-slate-700 focus:border-slate-500 text-slate-100 cursor-pointer"
              >
                  {[2,4,8].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* Min Note Textbox directly under Time Meter */}
            <div className="mt-3 flex flex-col items-center w-full">
              <div className="flex justify-between items-center w-full px-0.5 mb-1">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest" title="Ignore notes below this key (Middle C = C4)">Min Note</label>
                <span className={`text-[8px] font-mono font-bold ${parseNoteNameToMidi(minNote) !== null ? 'text-slate-400' : 'text-rose-400'}`}>
                  {parseNoteNameToMidi(minNote) !== null ? `≥ ${minNote.toUpperCase()}` : 'INVALID'}
                </span>
              </div>
              <input 
                type="text" 
                value={minNote}
                onChange={(e) => {
                  setMinNote(e.target.value);
                  setValidationError(null);
                }}
                placeholder="C4"
                maxLength={4}
                className={`h-7 w-20 px-2 bg-slate-800 rounded-lg text-xs font-mono font-bold text-center uppercase outline-none border transition-colors ${parseNoteNameToMidi(minNote) === null ? 'border-rose-500 text-rose-300 focus:border-rose-400' : 'border-slate-700 focus:border-slate-500 text-slate-100'}`}
                title="Lowest note to transcribe (e.g. C4, F#3, Bb3). Any key below this is transparent to the app."
              />
            </div>
          </div>

          {/* Column 3: Key Signature */}
          <div className="flex flex-col items-center">
             <label className="text-[9px] font-black text-slate-600 uppercase block mb-1.5 tracking-widest">Key Sig</label>
             <select
                value={keySignature}
                onChange={(e) => setKeySignature(e.target.value)}
                className="h-8 w-[122px] px-2 bg-slate-800 rounded-lg text-xs font-black text-slate-100 outline-none border border-slate-700 focus:border-slate-500 cursor-pointer shadow-sm transition-colors"
             >
                {KEY_SIGNATURES.map(ks => (
                  <option key={ks.code} value={ks.code} className="bg-slate-900 text-slate-100 font-sans">
                    {ks.label}
                  </option>
                ))}
             </select>
          </div>

          {/* Column 4: Measures & Test Latency */}
          <div className="flex flex-col items-center">
            <label className="text-[9px] font-black text-slate-600 uppercase block mb-1.5 tracking-widest">Measures</label>
            <div className="flex items-center gap-1.5">
              <button onClick={()=>setMeasures(m=>Math.max(1,m-1))} className="w-8 h-8 bg-slate-800 rounded-lg text-base font-black hover:bg-slate-700 active:scale-95 transition-all text-slate-200">-</button>
              <span className="text-2xl sm:text-3xl font-mono font-black w-8 text-center tabular-nums">{measures}</span>
              <button onClick={()=>setMeasures(m=>Math.min(32,m+1))} className="w-8 h-8 bg-slate-800 rounded-lg text-base font-black hover:bg-slate-700 active:scale-95 transition-all text-slate-200">+</button>
            </div>

            <div className="mt-3">
              <button 
                onClick={testLatency} 
                className="px-3 h-7 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg text-[9px] font-black text-slate-300 uppercase tracking-wider hover:bg-slate-700 hover:text-white transition-all whitespace-nowrap shadow-sm active:scale-95"
              >
                Test Latency
              </button>
            </div>
          </div>
        </div>
      </div>

      <ScoreDisplay notes={recordedNotes} timeSig={timeSig} measures={measures} isSessionActive={isPlaying} tempo={tempo} keySignature={keySignature} accidentalMode={accidentalMode} toleranceMs={toleranceMs} onDebugLog={setDebugInfo} />
      <Telemetry notes={recordedNotes} isSessionActive={isPlaying} toleranceMs={toleranceMs} />
      <DebugPanel debugInfo={debugInfo} />
      <InstructionsModal isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
      <footer className="text-center opacity-20 text-[8px] font-black uppercase tracking-[0.6em] pb-3 shrink-0">Engine Core v12.3 • DOM Coloring Strategy Active</footer>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);