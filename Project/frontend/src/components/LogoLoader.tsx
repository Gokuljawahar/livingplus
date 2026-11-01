import { useEffect, useState } from 'react';
import { Home, IndianRupee, Check } from 'lucide-react';

export default function LogoLoader({ onComplete }: { onComplete?: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // phase 0: Start (Houses slide in, center bubble scales up)
    // phase 1: Flip to checkmark
    // phase 2: Flip back to currency + Text fades in
    // phase 3: Done
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(() => setPhase(2), 2400);
    const t3 = setTimeout(() => {
      setPhase(3);
      if (onComplete) onComplete();
    }, 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-[100] flex flex-col items-center justify-center animate-in fade-in duration-500">
      <div className="relative w-full max-w-sm h-64 flex flex-col items-center justify-center">
        
        {/* Logo Container */}
        <div className="relative w-full h-32 flex items-center justify-center">
          
          {/* Left House */}
          <div 
            className={`absolute transition-all duration-1000 flex items-center justify-center
              ${phase === 0 ? '-translate-x-32 opacity-0' : '-translate-x-12 opacity-100'}
            `}
            style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            <div className="bg-[#02224B] text-white p-3 rounded-xl shadow-lg transform -skew-x-6">
              <Home className="w-8 h-8" strokeWidth={2.5} />
            </div>
          </div>

          {/* Right House */}
          <div 
            className={`absolute transition-all duration-1000 flex items-center justify-center
              ${phase === 0 ? 'translate-x-32 opacity-0' : 'translate-x-12 opacity-100'}
            `}
            style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            <div className="bg-[#02224B] text-white p-3 rounded-xl shadow-lg transform skew-x-6">
              <Home className="w-8 h-8" strokeWidth={2.5} />
            </div>
          </div>

          {/* Center Currency/Tick */}
          <div 
            className={`absolute z-10 transition-all duration-700 flex items-center justify-center
              ${phase === 0 ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}
            `}
            style={{ transitionDelay: phase === 0 ? '0ms' : '500ms', transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            <div className="relative w-16 h-16 rounded-full bg-[#FEB109] flex items-center justify-center shadow-xl border-[4px] border-white overflow-hidden">
              <div 
                className={`absolute inset-0 flex items-center justify-center transition-transform duration-500
                  ${phase === 1 ? 'scale-x-0' : 'scale-x-100'}
                `}
              >
                <IndianRupee className="w-8 h-8 text-[#02224B]" strokeWidth={3} />
              </div>
              <div 
                className={`absolute inset-0 flex items-center justify-center transition-transform duration-500
                  ${phase === 1 ? 'scale-x-100' : 'scale-x-0'}
                `}
              >
                <Check className="w-8 h-8 text-[#02224B]" strokeWidth={4} />
              </div>
            </div>
          </div>
          
        </div>

        {/* Text */}
        <div 
          className={`mt-6 transition-all duration-700 ease-out transform
            ${phase >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
          `}
        >
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Living Plus</h1>
        </div>

      </div>
    </div>
  );
}
