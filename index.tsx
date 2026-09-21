import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';

/**
 * MUSIC DATA & CONFIG
 */

// Generated mapping for AlphaTex notation
// Standard MIDI: C4 (Middle C) = 60.
// AlphaTab's default treble clef renders AlphaTex octave 3 as Middle C (ledger line below staff).
// Octave 4 is C in the 3rd space (C5).
// Therefore, alphaTabOctave = Math.floor(midi / 12) - 2 places notes at their true written staff pitch.
const SHARP_NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const FLAT_NOTE_NAMES  = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];

const generateAlphaTabMap = (names: string[]): Record<number, string> => {
  const map: Record<number, string> = {};
  for (let midi = 12; midi <= 127; midi++) {
    const semitone = midi % 12;
    const alphaTabOctave = Math.floor(midi / 12) - 2;
    map[midi] = `${names[semitone]}${alphaTabOctave}`;
  }
  return map;
};

const MIDI_TO_ALPHATAB_SHARPS: Record<number, string> = generateAlphaTabMap(SHARP_NOTE_NAMES);
const MIDI_TO_ALPHATAB_FLATS: Record<number, string> = generateAlphaTabMap(FLAT_NOTE_NAMES);

export type QuantizationValue = '1/8' | '1/16' | '1/32' | '1/64';
export const QUANTIZATION_DIVISIONS: Record<QuantizationValue, number> = {
  '1/8': 8,
  '1/16': 16,
  '1/32': 32,
  '1/64': 64
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

// Computer keyboard map (Middle C = 60)
const KBD_MAP: Record<string, number> = {
  'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65, 't': 66, 'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72, 'l': 74, ';': 76,
  'q': 72, '2': 73, '3': 75, 'r': 77, '5': 78, '6': 80, '7': 82, 'i': 84, 'o': 86, 'p': 88
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
  
  // Standard MIDI: C4 (Middle C) = 60. Octave 4: (4 + 1) * 12 + 0 = 60.
  const midi = (octave + 1) * 12 + semitone;
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

const useMidi = (onMidiMessage?: (data: number[], timeStamp: number, source: 'midi' | 'keyboard') => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [midiSupported, setMidiSupported] = useState(false);
  const [midiAccess, setMidiAccess] = useState<any>(null);

  const onMidiMessageRef = useRef(onMidiMessage);
  useEffect(() => {
    onMidiMessageRef.current = onMidiMessage;
  }, [onMidiMessage]);

  const emit = useCallback((data: number[], timeStamp: number, source: 'midi' | 'keyboard') => {
    onMidiMessageRef.current?.(data, timeStamp, source);
  }, []);

  useEffect(() => {
    // Check for MIDI support safely
    if ((navigator as any).requestMIDIAccess) {
      setMidiSupported(true);
    }

    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      const midi = KBD_MAP[e.key.toLowerCase()];
      if (midi) {
        emit([isDown ? 144 : 128, midi, isDown ? 100 : 0], performance.now(), 'keyboard');
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
  }, [emit]);

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
        emit(data, performance.now(), 'midi');
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
  }, [emit]);

  return { isConnected, midiSupported, midiAccess, connectMidi };
};

interface RecordedNote {
  id: string;
  midi: number;
  diffMs: number;
  measure: number;
  beatIndex: number;
  subdivIndex: number;
  durationSubdivs: number; 
}

const ScoreDisplay = ({ notes, timeSig, measures, isSessionActive, tempo, keySignature, accidentalMode, toleranceMs, quantization, onDebugLog }: { notes: RecordedNote[], timeSig: {beats: number, value: number}, measures: number, isSessionActive: boolean, tempo: number, keySignature: string, accidentalMode: 'flats' | 'sharps', toleranceMs: number, quantization: QuantizationValue, onDebugLog?: React.Dispatch<React.SetStateAction<string>> }) => {
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

    const subdivisionsPerWhole = QUANTIZATION_DIVISIONS[quantization] || 16;
    const subdivsPerBeat = subdivisionsPerWhole / timeSig.value;
    const measureSubdivisions = timeSig.beats * subdivsPerBeat;
    const totalSubdivisions = measures * measureSubdivisions;
    const texMetadata: any[] = [];

    // Allowed durations in units of subdivisions
    const allowedRhythms: { units: number; label: string }[] = [];
    const standardDivisions = [
      { div: 1, label: '1' },
      { div: 2, label: '2' },
      { div: 4, label: '4' },
      { div: 8, label: '8' },
      { div: 16, label: '16' },
      { div: 32, label: '32' },
      { div: 64, label: '64' },
    ];
    for (const sd of standardDivisions) {
      if (subdivisionsPerWhole >= sd.div) {
        const units = Math.round(subdivisionsPerWhole / sd.div);
        if (units >= 1) {
          allowedRhythms.push({ units, label: sd.label });
        }
      }
    }
    allowedRhythms.sort((a, b) => b.units - a.units);

    // 1. Sort notes by time for linear processing
    const getNotePos = (n: RecordedNote) => (n.measure * measureSubdivisions) + (n.beatIndex * subdivsPerBeat) + n.subdivIndex;
    const sortedNotes = [...recordedNotes].sort((a, b) => getNotePos(a) - getNotePos(b));

    let currentSubdiv = 0;
    
    // 2. Linear scan of the entire timeline
    while (currentSubdiv < totalSubdivisions) {
      const inMeasureIdx = currentSubdiv % measureSubdivisions;
      const remainingInMeasure = measureSubdivisions - inMeasureIdx;
      
      // Check for note(s) starting exactly at this slot
      const startsAtSlot = sortedNotes.filter(n => Math.abs(getNotePos(n) - currentSubdiv) < 0.1);

      if (startsAtSlot.length > 0) {
        // --- NOTE DETECTED ---
        const rawDur = Math.max(...startsAtSlot.map(n => n.durationSubdivs));
        
        // Find next note start in the score to prevent skipping notes when notes overlap (legato)
        const nextNote = sortedNotes.find(n => getNotePos(n) > currentSubdiv + 0.1);
        const maxUntilNext = nextNote ? (getNotePos(nextNote) - currentSubdiv) : remainingInMeasure;

        // We ensure we don't cross bar lines (remainingInMeasure) AND don't skip over the next note (maxUntilNext)
        const maxDur = Math.max(1, Math.min(rawDur, remainingInMeasure, maxUntilNext)); 

        // Snap to largest standard duration
        let writeDur = 1;
        let rhythm = allowedRhythms[allowedRhythms.length - 1].label;
        for (const ar of allowedRhythms) {
          if (ar.units <= maxDur) {
            writeDur = ar.units;
            rhythm = ar.label;
            break;
          }
        }
        
        // Deduplicate notes at the same slot by MIDI number
        const uniqueHitsByMidi = new Map<number, RecordedNote>();
        for (const h of startsAtSlot) {
          if (!uniqueHitsByMidi.has(h.midi)) {
            uniqueHitsByMidi.set(h.midi, h);
          }
        }
        const distinctHits = Array.from(uniqueHitsByMidi.values());

        // Render Note
        if (distinctHits.length === 1) {
          const noteName = noteMap[distinctHits[0].midi] || 'c3';
          tex += `${noteName}.${rhythm} `;
        } else {
          tex += "(";
          distinctHits.forEach((h, idx) => {
            const noteName = noteMap[h.midi] || 'c3';
            tex += `${noteName}${idx === distinctHits.length - 1 ? '' : ' '}`;
          });
          tex += ").";
          tex += `${rhythm} `;
        }
        
        texMetadata.push({ hits: distinctHits });
        currentSubdiv += writeDur;

      } else {
        // --- NO NOTE (REST NEEDED) ---
        // Calculate gap size until next note or end of measure
        const nextNote = sortedNotes.find(n => getNotePos(n) > currentSubdiv + 0.1);
        const available = Math.min(nextNote ? getNotePos(nextNote) - currentSubdiv : totalSubdivisions - currentSubdiv, remainingInMeasure);

        // Find largest rest that fits
        let writeDur = 1;
        let rhythm = allowedRhythms[allowedRhythms.length - 1].label;
        for (const ar of allowedRhythms) {
          if (ar.units <= available) {
            writeDur = ar.units;
            rhythm = ar.label;
            break;
          }
        }

        tex += `r.${rhythm} `;
        texMetadata.push({ hits: null });
        currentSubdiv += writeDur;
      }

      // Add bar lines
      if (currentSubdiv > 0 && currentSubdiv % measureSubdivisions === 0) {
        tex += "| ";
      }
    }

    return { tex, texMetadata };
  }, [timeSig.beats, timeSig.value, measures, tempo, keySignature, accidentalMode, quantization]);

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
                 <span className="text-[9px] text-slate-600 font-black uppercase">Bar {n.measure+1} • Pos {n.beatIndex+1}.{n.subdivIndex+1}</span>
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
              <li>The test runs directly at your <strong className="text-slate-200">current tempo</strong> with a 1-measure count-in.</li>
              <li>Tap any piano key in exact synchronization with the metronome clicks.</li>
              <li>The offset is calculated against the metronome beat clicks and applied as your latency compensation.</li>
              <li>You can also fine-tune the latency offset manually using the <strong className="text-slate-200">+</strong> and <strong className="text-slate-200">-</strong> buttons under Test Latency.</li>
              <li><strong className="text-slate-200">Accuracy Controls</strong>: Use the slider or the <strong className="text-slate-200">+</strong> and <strong className="text-slate-200">-</strong> buttons under Tempo to adjust your timing window (default <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">±35ms</code>, down to <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">±5ms</code> for strict precision).</li>
            </ol>
          </section>

          {/* 5. How to Use */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">5. How to Practice & Read Feedback</h3>
            </div>
            <ul className="text-slate-400 pl-4 space-y-2">
              <li><strong className="text-slate-200">Set Configuration</strong>: Pick your desired <strong>Tempo</strong>, <strong>Time Meter</strong>, <strong>Key Signature</strong>, <strong>Measures</strong>, <strong>Min Note cutoff</strong> (defaults to C4 to ignore left-hand notes below Middle C), and <strong>Quantization</strong> grid (<code className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">1/8</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">1/16</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">1/32</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">1/64</code>). All settings save automatically.</li>
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
  const [quantization, setQuantization] = useState<QuantizationValue>(() => {
    const saved = savedConfig?.quantization;
    if (saved && (saved === '1/8' || saved === '1/16' || saved === '1/32' || saved === '1/64')) {
      return saved;
    }
    return '1/16';
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isIntro, setIsIntro] = useState(false);
  const [recordedNotes, setRecordedNotes] = useState<RecordedNote[]>([]);
  const [visualBeat, setVisualBeat] = useState(false);
  const [activeInput, setActiveInput] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const isLatencyTesting = useRef(false);
  const latencyTestOffsets = useRef<number[]>([]);
  const sessionNotesRef = useRef<RecordedNote[]>([]); // Track all notes for calculation

  const currentKeyDef = KEY_SIGNATURES.find(k => k.code === keySignature) || KEY_SIGNATURES[0];
  const accidentalMode = currentKeyDef.type === 'flats' ? 'flats' : 'sharps';

  const audioCtx = useRef<AudioContext | null>(null);
  const metTimer = useRef<any>(null);
  const activeNotes = useRef<Map<number, any>>(new Map());
  const activeInputTimer = useRef<any>(null);
  const lastNoteOnsetRef = useRef<{ perfTime: number; lastPerfTime: number; totalSubdivIdx: number } | null>(null);

  const tempoRef = useRef(tempo);
  const timeSigRef = useRef(timeSig);
  const measuresRef = useRef(measures);
  const minNoteRef = useRef(minNote);
  const quantizationRef = useRef(quantization);
  const isPlayingRef = useRef(isPlaying);
  const latencyMsRef = useRef(latencyMs);
  const isConnectedRef = useRef(false);

  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { timeSigRef.current = timeSig; }, [timeSig]);
  useEffect(() => { measuresRef.current = measures; }, [measures]);
  useEffect(() => { minNoteRef.current = minNote; }, [minNote]);
  useEffect(() => { quantizationRef.current = quantization; }, [quantization]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { latencyMsRef.current = latencyMs; }, [latencyMs]);

  // Save config to localStorage whenever user changes settings
  useEffect(() => {
    if (isLatencyTesting.current) return;
    try {
      const configToSave = { tempo, timeSig, measures, latencyMs, keySignature, toleranceMs, minNote, quantization };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
    } catch (e) {
      console.warn("Failed to save config to localStorage", e);
    }
  }, [tempo, timeSig, measures, latencyMs, keySignature, toleranceMs, minNote, quantization]);

  const state = useRef({
    nextNoteTime: 0,
    currentBeat: 0,
    measureCount: 0,
    isRecording: false,
    beatTimes: [] as { audioTime: number, perfTime: number }[],
    recordingStartPerfTime: 0,
  });

  const stop = useCallback(() => {
    if (metTimer.current) clearTimeout(metTimer.current);

    // Flush any active notes that are still held down
    const now = performance.now();
    const flushedNotes: RecordedNote[] = [];
    const beatDurMs = (60.0 / tempoRef.current) * 1000;
    const subdivisionsPerWhole = QUANTIZATION_DIVISIONS[quantizationRef.current] || 16;
    const subdivsPerBeat = subdivisionsPerWhole / timeSigRef.current.value;
    const subdivDurMs = beatDurMs / subdivsPerBeat;

    activeNotes.current.forEach((startData, midi) => {
      // Force end time to now
      const endTime = now - latencyMs;
      const durMs = endTime - startData.startTime;
      const durationSubdivs = Math.max(1, Math.round(durMs / subdivDurMs));
      
      if (startData.mIdx >= 0 && startData.mIdx < measuresRef.current) {
         const newNote: RecordedNote = {
            id: Math.random().toString(36).substr(2, 9),
            midi,
            diffMs: startData.diffMs,
            measure: startData.mIdx,
            beatIndex: startData.bIdx,
            subdivIndex: startData.sIdx,
            durationSubdivs
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
       const offsets = latencyTestOffsets.current;
       if (offsets.length > 0) {
           // If we have at least 4 taps, discard the min and max extremes for a cleaner trimmed average
           let validOffsets = [...offsets];
           if (validOffsets.length >= 4) {
             validOffsets.sort((a, b) => a - b);
             validOffsets = validOffsets.slice(1, -1);
           }
           const sum = validOffsets.reduce((acc, o) => acc + o, 0);
           const avg = sum / validOffsets.length;
           const newLatency = Math.round(avg);
           setLatencyMs(newLatency);
           latencyMsRef.current = newLatency;
           setDebugInfo(`[Calibration] Latency Test Complete at ${tempoRef.current} BPM.\nCollected ${offsets.length} taps (Avg offset: ${avg >= 0 ? `+${avg.toFixed(1)}` : avg.toFixed(1)}ms).\nSet Latency Compensation to: ${newLatency >= 0 ? `+${newLatency}` : newLatency}ms.`);
       } else {
           setDebugInfo(`[Calibration] No taps detected during latency test at ${tempoRef.current} BPM.\nLatency remains: ${latencyMsRef.current}ms.`);
       }
       isLatencyTesting.current = false;
       latencyTestOffsets.current = [];
    }

    setIsPlaying(false);
    setIsIntro(false);
    state.current.isRecording = false;
    state.current.recordingStartPerfTime = 0;
    lastNoteOnsetRef.current = null;
  }, [latencyMs]);

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

  const handleMidiMessage = useCallback((data: number[], timeStamp: number) => {
    const [statusByte, rawMidi, vel] = data;
    const midi = rawMidi;

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
    if (activeInputTimer.current) clearTimeout(activeInputTimer.current);
    activeInputTimer.current = setTimeout(() => setActiveInput(false), 120);

    // Only play synth sound if NO external MIDI device is connected
    if (isNoteOn && !isConnectedRef.current) {
      playSynth(midi);
    }

    // Latency compensation: Adjust input time by calibrated offset
    const perfTime = timeStamp - latencyMsRef.current;

    // Latency test mode: measure user taps directly against the nearest metronome beat click
    if (isLatencyTesting.current) {
      if (isNoteOn) {
        const recStartTime = state.current.recordingStartPerfTime;
        const beatDurMs = (60.0 / tempoRef.current) * 1000;
        if (recStartTime > 0 && perfTime >= recStartTime - (beatDurMs / 2)) {
          const timeSinceStart = perfTime - recStartTime;
          const nearestBeatIdx = Math.round(timeSinceStart / beatDurMs);
          const targetBeatTime = nearestBeatIdx * beatDurMs;
          const beatOffset = timeSinceStart - targetBeatTime;
          // Accept taps within reasonable vicinity of a beat (45% of beat length)
          if (Math.abs(beatOffset) <= beatDurMs * 0.45) {
            latencyTestOffsets.current.push(beatOffset);
          }
        }
      }
      if (isNoteOff) {
        activeNotes.current.delete(midi);
      }
      return;
    }

    // 2. Recording Logic: Ensure notes start to be transcribed strictly at or after the first click of recording
    if (isNoteOn) {
      const recStartTime = state.current.recordingStartPerfTime;
      const beatDurMs = (60.0 / tempoRef.current) * 1000;
      const subdivisionsPerWhole = QUANTIZATION_DIVISIONS[quantizationRef.current] || 16;
      const subdivsPerBeat = subdivisionsPerWhole / timeSigRef.current.value;
      const subdivDurMs = beatDurMs / subdivsPerBeat;
      const measureSubdivisions = timeSigRef.current.beats * subdivsPerBeat;

      // Notes must start being transcribed ONLY at or after the first click of recording!
      // Allow up to half a subdivision early tolerance for human anticipation of the first downbeat
      const isEligible = isPlayingRef.current && recStartTime > 0 && perfTime >= recStartTime - (subdivDurMs / 2);

      if (isEligible) {
        // Repeated-pitch guard:
        // If this same pitch is already held in activeNotes, finalize and commit the previous note.
        // This prevents rapid repeated strikes of the same key from overwriting each other.
        if (activeNotes.current.has(midi)) {
          const prev = activeNotes.current.get(midi)!;
          const durMs = Math.max(10, perfTime - prev.startTime);
          const durationSubdivs = Math.max(1, Math.round(durMs / subdivDurMs));
          if (prev.mIdx >= 0 && prev.mIdx < measuresRef.current) {
            const finishedNote: RecordedNote = {
              id: Math.random().toString(36).substr(2, 9),
              midi,
              diffMs: prev.diffMs,
              measure: prev.mIdx,
              beatIndex: prev.bIdx,
              subdivIndex: prev.sIdx,
              durationSubdivs
            };
            if (!isLatencyTesting.current) {
              setRecordedNotes(prevNotes => [...prevNotes, finishedNote]);
            }
            sessionNotesRef.current.push(finishedNote);
          }
          activeNotes.current.delete(midi);
        }

        const timeSinceStart = perfTime - recStartTime;
        let totalSubdivIdx = Math.round(timeSinceStart / subdivDurMs);

        // Anti-merging guard for sequential notes:
        // When notes are played separately, prevent rounding collisions where two successive notes
        // collapse into the same subdivision slot as an accidental chord.
        const lastNote = lastNoteOnsetRef.current;
        if (lastNote) {
          const timeSinceCluster = perfTime - lastNote.perfTime;
          const timeSinceLast = perfTime - lastNote.lastPerfTime;
          // Simultaneous chord tolerance: notes struck within 40ms of previous and 65ms of cluster start
          const isSimultaneousChord = timeSinceLast <= 40 && timeSinceCluster <= 65;

          if (!isSimultaneousChord) {
            // Notes were played separately: guarantee this note takes at least the next slot
            if (totalSubdivIdx <= lastNote.totalSubdivIdx) {
              totalSubdivIdx = lastNote.totalSubdivIdx + 1;
            }
            lastNoteOnsetRef.current = {
              perfTime,
              lastPerfTime: perfTime,
              totalSubdivIdx
            };
          } else {
            // Part of intentional simultaneous chord: group in the same slot
            lastNote.lastPerfTime = perfTime;
            totalSubdivIdx = lastNote.totalSubdivIdx;
          }
        } else {
          lastNoteOnsetRef.current = {
            perfTime,
            lastPerfTime: perfTime,
            totalSubdivIdx
          };
        }

        if (totalSubdivIdx >= 0) {
          const mIdx = Math.floor(totalSubdivIdx / measureSubdivisions);
          const inMeasureSubdiv = totalSubdivIdx % measureSubdivisions;
          const bIdx = Math.floor(inMeasureSubdiv / subdivsPerBeat);
          const sIdx = inMeasureSubdiv % subdivsPerBeat;
          const diffMs = timeSinceStart - (totalSubdivIdx * subdivDurMs);

          if (mIdx < measuresRef.current) {
            activeNotes.current.set(midi, {
              startTime: perfTime,
              mIdx,
              bIdx,
              sIdx,
              diffMs
            });
          }
        }
      }
    }

    // Process Note OFF even if recording just stopped, to capture tail notes
    if (isNoteOff) {
      const startData = activeNotes.current.get(midi);
      if (startData) {
        const endTime = perfTime; 
        const beatDurMs = (60.0 / tempoRef.current) * 1000;
        const subdivisionsPerWhole = QUANTIZATION_DIVISIONS[quantizationRef.current] || 16;
        const subdivsPerBeat = subdivisionsPerWhole / timeSigRef.current.value;
        const subdivDurMs = beatDurMs / subdivsPerBeat;
        const durMs = endTime - startData.startTime;
        
        const durationSubdivs = Math.max(1, Math.round(durMs / subdivDurMs));
        
        if (startData.mIdx >= 0 && startData.mIdx < measuresRef.current) {
          const newNote: RecordedNote = {
            id: Math.random().toString(36).substr(2, 9),
            midi,
            diffMs: startData.diffMs,
            measure: startData.mIdx,
            beatIndex: startData.bIdx,
            subdivIndex: startData.sIdx,
            durationSubdivs
          };
          // Only add to visual staff if NOT testing latency
          if (!isLatencyTesting.current) {
            setRecordedNotes(prevNotes => [...prevNotes, newNote]);
          }
          sessionNotesRef.current.push(newNote);
        }
        activeNotes.current.delete(midi);
      }
    }
  }, [playSynth]);

  const { isConnected, midiSupported, midiAccess, connectMidi } = useMidi(handleMidiMessage);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  const tick = useCallback(() => {
    if (!audioCtx.current) return;
    const outputLatencySec = (audioCtx.current.outputLatency || 0) + (audioCtx.current.baseLatency || 0);

    while (state.current.nextNoteTime < audioCtx.current.currentTime + 0.1) {
      // Check if we have finished all measures (measureCount starts at 0 for bar 1)
      // We add 1 to account for the mandatory intro bar.
      if (state.current.measureCount >= measuresRef.current + 1) {
        setTimeout(stop, 500);
        return;
      }

      const time = state.current.nextNoteTime;
      const isDown = state.current.currentBeat === 0;
      const isFirstRecordingClick = state.current.measureCount === 1 && isDown;
      
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      
      // High pitch for downbeat/first click (1600 Hz / 1760 Hz) vs secondary beats (800 Hz)
      const freq = isFirstRecordingClick ? 1760 : isDown ? 1600 : 800;
      const peakGain = isFirstRecordingClick ? 0.45 : isDown ? 0.38 : 0.15;
      
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(peakGain, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      osc.connect(gain); 
      gain.connect(audioCtx.current.destination);
      osc.start(time); 
      osc.stop(time + 0.08);

      const delayMs = (time - audioCtx.current.currentTime + outputLatencySec) * 1000;
      const perfTime = performance.now() + delayMs;
      const thisBeatIdx = state.current.beatTimes.length;
      state.current.beatTimes.push({ audioTime: time, perfTime });
      
      // The first click of recording occurs at beat index === timeSigRef.current.beats
      if (thisBeatIdx === timeSigRef.current.beats) {
        state.current.recordingStartPerfTime = perfTime;
      }

      setTimeout(() => { 
        setVisualBeat(true); 
        setTimeout(() => setVisualBeat(false), 80); 

        // Start recording exactly at the first click of recording
        if (thisBeatIdx === timeSigRef.current.beats) {
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

    const outputLatencySec = (audioCtx.current.outputLatency || 0) + (audioCtx.current.baseLatency || 0);
    const startAudioTime = audioCtx.current.currentTime + 0.1;
    const startPerfTime = performance.now() + (0.1 + outputLatencySec) * 1000;
    const beatDurMs = (60.0 / tempo) * 1000;
    // Exactly timeSig.beats beats of intro count-in before the recording's first click
    const estimatedRecStartTime = startPerfTime + (timeSig.beats * beatDurMs);

    state.current = { 
      nextNoteTime: startAudioTime, 
      currentBeat: 0, 
      measureCount: 0, 
      isRecording: false, 
      beatTimes: [],
      recordingStartPerfTime: estimatedRecStartTime
    };
    setRecordedNotes([]);
    sessionNotesRef.current = [];
    lastNoteOnsetRef.current = null;
    setIsPlaying(true); 
    setIsIntro(true); 
    tick();
  };

  const testLatency = () => {
    if (isPlaying) stop();
    latencyTestOffsets.current = [];
    isLatencyTesting.current = true;
    latencyMsRef.current = 0; 
    setLatencyMs(0); 
    setDebugInfo(`[Calibration] Starting Latency Test at active tempo (${tempo} BPM)...\nPlease tap/play in sync with the metronome click for ${measures} ${measures === 1 ? 'bar' : 'bars'}.`);
    
    // Defer start slightly to allow audio context and state to initialize
    setTimeout(() => onStart(), 100);
  };

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
            
            {/* Accuracy control placed directly under tempo with - and + buttons */}
            <div className="mt-3 flex flex-col items-center w-full">
              <div className="flex justify-between items-center w-full px-0.5 mb-1">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest" title="Timing window for Perfect rating">Accuracy</label>
                <span className="text-[9px] font-mono font-bold text-slate-300">±{toleranceMs}ms</span>
              </div>
              <div className="flex items-center gap-1.5 w-full justify-center">
                <button
                  type="button"
                  onClick={() => setToleranceMs(t => Math.max(5, t - 2))}
                  className="w-5 h-5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded text-xs font-black flex items-center justify-center border border-slate-700 transition-all cursor-pointer select-none"
                  title="Tighter accuracy (-2ms)"
                >
                  -
                </button>
                <input 
                  type="range" 
                  min="5" 
                  max="65" 
                  step="1"
                  value={toleranceMs}
                  onChange={(e) => setToleranceMs(parseInt(e.target.value))}
                  className="w-14 sm:w-16 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-400 focus:outline-none"
                  title={`Timing accuracy threshold: ±${toleranceMs}ms`}
                />
                <button
                  type="button"
                  onClick={() => setToleranceMs(t => Math.min(65, t + 2))}
                  className="w-5 h-5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded text-xs font-black flex items-center justify-center border border-slate-700 transition-all cursor-pointer select-none"
                  title="Looser accuracy (+2ms)"
                >
                  +
                </button>
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

          {/* Column 3: Key Signature & Quantization (to the right of Min Note) */}
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

            {/* Quantization Dropdown directly to the right of Min Note */}
            <div className="mt-3 flex flex-col items-center w-full">
              <div className="flex justify-between items-center w-full px-0.5 mb-1">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest" title="Quantization grid division">Quantization</label>
                <span className="text-[8px] font-mono font-bold text-slate-400">{quantization}</span>
              </div>
              <select 
                value={quantization}
                onChange={(e) => setQuantization(e.target.value as QuantizationValue)}
                className="h-7 w-20 px-2 bg-slate-800 rounded-lg text-xs font-mono font-bold text-center outline-none border border-slate-700 focus:border-slate-500 text-slate-100 cursor-pointer transition-colors"
                title="Quantization grid resolution (1/8, 1/16, 1/32, 1/64)"
              >
                <option value="1/8" className="bg-slate-900 text-slate-100 font-sans">1/8</option>
                <option value="1/16" className="bg-slate-900 text-slate-100 font-sans">1/16</option>
                <option value="1/32" className="bg-slate-900 text-slate-100 font-sans">1/32</option>
                <option value="1/64" className="bg-slate-900 text-slate-100 font-sans">1/64</option>
              </select>
            </div>
          </div>

          {/* Column 4: Measures & Test Latency */}
          <div className="flex flex-col items-center">
            <label className="text-[9px] font-black text-slate-600 uppercase block mb-1.5 tracking-widest">Measures</label>
            <div className="flex items-center gap-1.5">
              <button onClick={()=>setMeasures(m=>Math.max(1,m-1))} className="w-8 h-8 bg-slate-800 rounded-lg text-base font-black hover:bg-slate-700 active:scale-95 transition-all text-slate-200">-</button>
              <span className="text-2xl sm:text-3xl font-mono font-black w-8 text-center tabular-nums">{measures}</span>
              <button onClick={()=>setMeasures(m=>Math.min(32,m+1))} className="w-8 h-8 bg-slate-800 rounded-lg text-base font-black hover:bg-slate-700 active:scale-95 transition-all text-slate-200">+</button>
            </div>

            <div className="mt-3 flex flex-col items-center">
              <button 
                onClick={testLatency} 
                className="px-3 h-7 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg text-[9px] font-black text-slate-300 uppercase tracking-wider hover:bg-slate-700 hover:text-white transition-all whitespace-nowrap shadow-sm active:scale-95 cursor-pointer"
                title={`Calibrate latency at current tempo (${tempo} BPM)`}
              >
                Test Latency
              </button>
              <div className="flex items-center gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(-100, latencyMs - 5);
                    setLatencyMs(next);
                    latencyMsRef.current = next;
                  }}
                  className="w-4 h-4 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white rounded text-[10px] font-black flex items-center justify-center border border-slate-700 cursor-pointer select-none"
                  title="Nudge latency compensation -5ms"
                >
                  -
                </button>
                <span className="text-[8px] font-mono text-slate-300 font-bold px-0.5 min-w-[38px] text-center">
                  {latencyMs === 0 ? '0ms' : `${latencyMs > 0 ? `+${latencyMs}` : latencyMs}ms`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(300, latencyMs + 5);
                    setLatencyMs(next);
                    latencyMsRef.current = next;
                  }}
                  className="w-4 h-4 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white rounded text-[10px] font-black flex items-center justify-center border border-slate-700 cursor-pointer select-none"
                  title="Nudge latency compensation +5ms"
                >
                  +
                </button>
                {latencyMs !== 0 && (
                  <button 
                    onClick={() => {
                      setLatencyMs(0);
                      latencyMsRef.current = 0;
                    }} 
                    className="text-[7px] font-mono font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer ml-0.5"
                    title="Reset latency compensation to 0ms"
                  >
                    reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ScoreDisplay notes={recordedNotes} timeSig={timeSig} measures={measures} isSessionActive={isPlaying} tempo={tempo} keySignature={keySignature} accidentalMode={accidentalMode} toleranceMs={toleranceMs} quantization={quantization} onDebugLog={setDebugInfo} />
      <Telemetry notes={recordedNotes} isSessionActive={isPlaying} toleranceMs={toleranceMs} />
      <DebugPanel debugInfo={debugInfo} />
      <InstructionsModal isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
      <footer className="text-center opacity-20 text-[8px] font-black uppercase tracking-[0.6em] pb-3 shrink-0">Engine Core v12.3 • DOM Coloring Strategy Active</footer>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);