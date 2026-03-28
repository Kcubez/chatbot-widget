'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  CheckCircle2, 
  ChevronRight, 
  CalendarDays, 
  Loader2, 
  AlertCircle,
  ArrowLeft,
  CalendarCheck2,
  Stethoscope
} from 'lucide-react';

export default function CalendarWebView() {
  const { botId } = useParams<{ botId: string }>();
  const searchParams = useSearchParams();
  const psid = searchParams.get('psid'); 

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string | null>(null);
  const [step, setStep] = useState(1); // 1: Date, 2: Time, 3: Confirmation
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeSlots = [
    '09:00 AM', '10:00 AM', '11:00 AM', 
    '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'
  ];

  useEffect(() => {
    (window as any).extAsyncInit = function() {
      console.log('Messenger SDK Loaded');
    };
    const script = document.createElement('script');
    script.id = 'messenger-sdk';
    script.src = 'https://connect.facebook.net/en_US/messenger.Extensions.js';
    document.head.appendChild(script);
  }, []);

  const handleSubmit = async () => {
    if (!date || !time || !psid) {
      if (!psid) setError('User context missing. Please reopen in Messenger.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const formattedDate = date.toLocaleDateString('en-GB');

    try {
      const res = await fetch(`/api/bots/${botId}/webview/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psid, date: formattedDate, time }),
      });

      if (!res.ok) throw new Error('Submission failed');

      setSubmitted(true);

      // Attempt to close WebView
      if ((window as any).MessengerExtensions) {
        setTimeout(() => {
          (window as any).MessengerExtensions.requestCloseBrowser(
            () => {}, (err: any) => console.error(err)
          );
        }, 2000);
      }
    } catch (err: any) {
      setError('ခဏတာ အမှားအယွင်းရှိနေပါသည်။ နောက်မှ ပြန်စမ်းပေးပါခင်ဗျာ။');
    } finally {
      setSubmitting(false);
    }
  };

  const formattedSelectedDate = useMemo(() => {
    return date ? date.toLocaleDateString('en-GB', { 
      day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' 
    }) : '';
  }, [date]);

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center animate-in zoom-in duration-500">
        <div className="h-24 w-24 rounded-full bg-emerald-500 flex items-center justify-center mb-8 shadow-2xl shadow-emerald-200">
          <CheckCircle2 className="h-12 w-12 text-white" />
        </div>
        <h1 className="text-3xl font-black text-zinc-900 mb-4">သဘောတူပြီးပါပြီ!</h1>
        <p className="text-zinc-500 mb-10 max-w-xs mx-auto leading-relaxed">
           ရက်ချိန်းတောင်းဆိုမှု အောင်မြင်ပါသည်။ ကျေးဇူးပြု၍ Messenger chat သို့ ပြန်သွား၍ အချက်အလက်များ ဆက်လက်ဖြည့်စွက်ပေးပါခင်ဗျာ။
        </p>
        <Button 
           className="w-full max-w-xs py-8 rounded-[32px] bg-zinc-900 font-bold text-lg"
           onClick={() => window.close()}
        >
          ပိတ်မည် (Close)
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-start font-sans select-none">
      <div className="w-full max-w-md bg-white min-h-screen flex flex-col shadow-2xl">
        
        {/* Step Header */}
        <div className="pt-12 px-8 pb-10 bg-zinc-900 text-white relative">
          <div className="flex items-center gap-3 mb-6 opacity-60">
             <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md">
                <Stethoscope className="h-5 w-5 text-blue-400" />
             </div>
             <span className="text-xs font-black uppercase tracking-widest">Medical Center Booking</span>
          </div>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-black tracking-tight leading-tight">
               ရက်ချိန်း<br/>ရွေးချယ်ရန်
            </h1>
            <div className="flex flex-col items-end gap-1">
               <span className="text-[10px] font-black uppercase text-zinc-500 tracking-tighter">Current Step</span>
               <div className="flex gap-1.5">
                  {[1, 2, 3].map(s => (
                    <div key={s} className={`h-1.5 w-6 rounded-full transition-all ${step >= s ? 'bg-blue-600' : 'bg-zinc-700'}`} />
                  ))}
               </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                <p className="text-[9px] uppercase font-bold text-zinc-500 mb-1">Date</p>
                <p className="text-xs font-bold truncate">{date ? date.toLocaleDateString('en-GB') : '-'}</p>
             </div>
             <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                <p className="text-[9px] uppercase font-bold text-zinc-500 mb-1">Time</p>
                <p className="text-xs font-bold truncate">{time || '-'}</p>
             </div>
          </div>
        </div>

        <div className="flex-1 p-8 -mt-6 bg-white rounded-t-[48px] shadow-2xl space-y-8 animate-in slide-in-from-bottom duration-500">
          
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 animate-bounce">
               <AlertCircle className="h-5 w-5 shrink-0" />
               <p className="text-xs font-bold">{error}</p>
            </div>
          )}

          {/* Step 1: Date */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                 <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black text-xs italic">1</div>
                 <h2 className="text-xl font-black text-zinc-900">ရက်စွဲရွေးပါ</h2>
              </div>
              <div className="border border-zinc-100 rounded-[32px] p-2 bg-zinc-50/50">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d: Date | undefined) => { if (d) { setDate(d); setStep(2); } }}
                  className="rounded-md mx-auto"
                  disabled={(d: Date) => d < new Date(new Date().setHours(0,0,0,0))}
                />
              </div>
            </div>
          )}

          {/* Step 2: Time */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 mb-4">
                 <Button variant="ghost" size="icon" onClick={() => setStep(1)} className="rounded-full bg-zinc-50">
                    <ArrowLeft className="h-4 w-4" />
                 </Button>
                 <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black text-xs italic">2</div>
                    <h2 className="text-xl font-black text-zinc-900">အချိန်ရွေးပါ</h2>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pb-20">
                {timeSlots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => { setTime(slot); setStep(3); }}
                    className={`flex items-center justify-between p-5 rounded-[24px] border-2 transition-all text-sm font-bold ${
                      time === slot 
                        ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xl shadow-blue-100' 
                        : 'border-zinc-100 bg-white text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Clock className={`h-4 w-4 ${time === slot ? 'text-blue-600' : 'text-zinc-400'}`} />
                      {slot}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Confirmation Summary */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in duration-300">
               <div className="flex items-center gap-4 mb-4">
                 <Button variant="ghost" size="icon" onClick={() => setStep(2)} className="rounded-full bg-zinc-50">
                    <ArrowLeft className="h-4 w-4" />
                 </Button>
                 <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-black text-xs italic">3</div>
                    <h2 className="text-xl font-black text-zinc-900">Summary</h2>
                 </div>
              </div>

              <div className="bg-zinc-50/50 border border-zinc-100 rounded-[32px] p-8 space-y-6">
                 <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-zinc-900 flex items-center justify-center shrink-0">
                       <CalendarCheck2 className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div>
                       <p className="text-xs font-black uppercase text-zinc-400 tracking-tighter mb-1">ရွေးချယ်ထားသောရက်</p>
                       <p className="text-base font-black text-zinc-900">{formattedSelectedDate}</p>
                    </div>
                 </div>

                 <div className="h-px bg-zinc-100 w-full" />

                 <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-zinc-900 flex items-center justify-center shrink-0">
                       <Clock className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                       <p className="text-xs font-black uppercase text-zinc-400 tracking-tighter mb-1">ရွေးချယ်ထားသောအချိန်</p>
                       <p className="text-base font-black text-zinc-900">{time}</p>
                    </div>
                 </div>
              </div>

              <div className="pt-6">
                <Button 
                  className={`w-full py-8 rounded-[32px] text-lg font-black transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xl shadow-emerald-200`}
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Confirm Booking'}
                </Button>
                <button 
                   className="w-full mt-4 text-xs font-black text-zinc-400 uppercase tracking-widest hover:text-zinc-900 transition-colors"
                   onClick={() => setStep(1)}
                   disabled={submitting}
                >
                   ရက်စွဲပြန်ပြင်မည်
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
