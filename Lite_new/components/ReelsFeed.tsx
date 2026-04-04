/*
import React, { useState, useEffect, useRef } from 'react';
import { Reel } from '../types';
import { MOCK_REELS } from '../constants';
import { Heart, Share2, ArrowLeft, Play, Pause, Volume2, VolumeX } from 'lucide-react';

const ReelsFeed: React.FC = () => {
  const [currentReelIndex, setCurrentReelIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [likedReels, setLikedReels] = useState<Set<string>>(new Set());
  
  // Scroll Snap Handler
  const handleScroll = () => {
    if (containerRef.current) {
      const scrollPosition = containerRef.current.scrollTop;
      const reelHeight = containerRef.current.clientHeight;
      const newIndex = Math.round(scrollPosition / reelHeight);
      
      if (newIndex !== currentReelIndex && newIndex >= 0 && newIndex < MOCK_REELS.length) {
        setCurrentReelIndex(newIndex);
      }
    }
  };

  const handleLike = (id: string) => {
    const newLiked = new Set(likedReels);
    if (newLiked.has(id)) {
      newLiked.delete(id);
    } else {
      newLiked.add(id);
    }
    setLikedReels(newLiked);
  };

  const handleShare = async (reel: Reel) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: reel.title,
          text: reel.description,
          url: window.location.href
        });
      } catch (err) {
        console.log('Error sharing', err);
      }
    } else {
      alert(`Copied link for: ${reel.title}`);
    }
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (containerRef.current) {
          const direction = e.key === 'ArrowDown' ? 1 : -1;
          const nextIndex = Math.min(Math.max(currentReelIndex + direction, 0), MOCK_REELS.length - 1);
          const reelHeight = containerRef.current.clientHeight;
          
          containerRef.current.scrollTo({
            top: nextIndex * reelHeight,
            behavior: 'smooth'
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentReelIndex]);

  return (
    <div className="h-[calc(100vh-100px)] w-full flex justify-center bg-black">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full w-full max-w-md bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        {MOCK_REELS.map((reel, index) => (
          <ReelItem 
            key={reel.id} 
            reel={reel} 
            isActive={index === currentReelIndex} 
            isLiked={likedReels.has(reel.id)}
            onLike={() => handleLike(reel.id)}
            onShare={() => handleShare(reel)}
          />
        ))}
      </div>
    </div>
  );
};

interface ReelItemProps {
  reel: Reel;
  isActive: boolean;
  isLiked: boolean;
  onLike: () => void;
  onShare: () => void;
}

const ReelItem: React.FC<ReelItemProps> = ({ reel, isActive, isLiked, onLike, onShare }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Play/Pause logic based on active state
  useEffect(() => {
    if (isActive) {
      if (videoRef.current) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch(() => {
              // Auto-play blocked, needs user interaction
              setIsPlaying(false);
              setIsMuted(true); // Mute to try and satisfy autoplay policy
            });
        }
      }
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        setIsPlaying(false);
      }
    }
  }, [isActive]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="h-full w-full snap-start relative border-b border-slate-800 bg-slate-900 flex items-center justify-center">
      
      {/* Video Container */}
      /*
      <div className="relative h-full w-full" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={reel.videoUrl}
          poster={reel.thumbnailUrl}
          className="h-full w-full object-cover"
          loop
          muted={isMuted}
          playsInline
        />
        
        {/* Play/Pause Overlay Indicator */}
        /*
        {!isPlaying && isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10 pointer-events-none">
            <div className="bg-black/50 p-4 rounded-full">
              <Play className="w-8 h-8 text-white fill-white" />
            </div>
          </div>
        )}
      </div>

      {/* Right Side Actions */}
      /*
      <div className="absolute right-4 bottom-20 flex flex-col items-center space-y-6 z-20">
        <div className="flex flex-col items-center">
          <button 
            onClick={(e) => { e.stopPropagation(); onLike(); }}
            className={`p-3 rounded-full bg-black/40 backdrop-blur-sm transition-transform active:scale-90 ${isLiked ? 'text-red-500' : 'text-white'}`}
          >
            <Heart className={`w-7 h-7 ${isLiked ? 'fill-red-500' : ''}`} />
          </button>
          <span className="text-white text-xs font-bold mt-1">{reel.likes + (isLiked ? 1 : 0)}</span>
        </div>

        <div className="flex flex-col items-center">
          <button 
            onClick={(e) => { e.stopPropagation(); onShare(); }}
            className="p-3 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
          >
            <Share2 className="w-7 h-7" />
          </button>
          <span className="text-white text-xs font-bold mt-1">Share</span>
        </div>

        <div className="flex flex-col items-center">
           <button
             onClick={toggleMute}
             className="p-3 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
           >
              {isMuted ? <VolumeX className="w-7 h-7" /> : <Volume2 className="w-7 h-7" />}
           </button>
        </div>
      </div>

      {/* Bottom Info */}
      /*
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 to-transparent p-4 pt-20 z-10">
        <div className="flex items-center mb-2">
           <div className="bg-indigo-600 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider mr-2">
              {reel.category}
           </div>
           <span className="text-white text-xs font-medium opacity-80">{reel.author}</span>
        </div>
        <h3 className="text-white text-base font-bold leading-tight mb-1">{reel.title}</h3>
        <p className="text-slate-300 text-xs line-clamp-2">{reel.description}</p>
        
        {/* Progress Bar (Simulated) */}
        /*
        <div className="w-full h-1 bg-slate-600/50 mt-4 rounded-full overflow-hidden">
           <div className="h-full bg-white/80 w-1/3"></div> {/* Mock progress */}
        /*</div>
      </div>

    </div>
  );
};

export default ReelsFeed;