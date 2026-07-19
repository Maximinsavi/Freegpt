import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

interface VoicePlayerProps {
  audioUrl: string;
}

export default function VoicePlayer({ audioUrl }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    // Pre-load audio to fetch metadata
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Playback failed", err);
      });
      setIsPlaying(true);
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const value = parseFloat(e.target.value);
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div id="voice-player-container" className="flex items-center gap-3 bg-white/15 rounded-2xl p-2.5 w-[260px] sm:w-[300px] text-white border border-white/10 select-none shadow-xs">
      <button
        id="voice-player-toggle"
        type="button"
        onClick={togglePlay}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 hover:scale-[1.03] active:scale-[0.97] transition-all shadow-sm cursor-pointer"
        title={isPlaying ? "Pause" : "Lire le message vocal"}
      >
        {isPlaying ? (
          <Pause className="h-4.5 w-4.5 fill-current text-emerald-600" />
        ) : (
          <Play className="h-4.5 w-4.5 fill-current text-emerald-600 ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleProgressChange}
            className="w-full accent-white h-1 rounded-lg bg-white/25 cursor-pointer outline-none"
          />
        </div>
        <div className="flex justify-between text-[9px] text-white/80 font-mono font-medium">
          <span>{formatTime(currentTime)}</span>
          <span className="flex items-center gap-0.5">
            <Volume2 className="h-2.5 w-2.5" />
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
