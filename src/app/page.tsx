import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Bot, Zap, Shield, MessageSquare, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Navigation */}
      <header className="px-6 lg:px-12 h-20 flex items-center border-b border-zinc-100 sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <Link className="flex items-center justify-center gap-2" href="/">
          <div className="h-10 w-10 rounded-xl bg-zinc-900 flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-zinc-900 leading-none">
            AI Widget SaaS
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-6">
          <Link href="/login">
            <Button className="rounded-full bg-zinc-900 hover:bg-zinc-800 px-8 h-11 text-sm font-medium shadow-lg hover:shadow-zinc-200 transition-all">
              Login
            </Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-24 lg:pt-32 lg:pb-40">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[60%] bg-blue-50/50 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[60%] bg-zinc-100 rounded-full blur-[120px]" />
          </div>

          <div className="container px-6 mx-auto text-center max-w-5xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-600 text-xs font-semibold mb-8 animate-in fade-in slide-in-from-bottom-3 duration-1000">
              <Zap className="h-3 w-3 text-amber-500 fill-amber-500" />
              <span>Powered by Gemini 2.5 Flash</span>
            </div>

            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-zinc-900 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-100">
              Your Business, <br />
              <span className="text-transparent bg-clip-text bg-linear-to-r from-zinc-900 via-zinc-500 to-zinc-900">
                Powered by Gemini AI
              </span>
            </h1>

            <p className="mx-auto max-w-2xl text-zinc-500 text-lg lg:text-xl mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-5 duration-1000 delay-200">
              Add a smart chatbot to your website in minutes. Train it with your data and let it
              handle customer support 24/7 with human-like intelligence.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-300">
              <Link href="/login">
                <Button
                  size="lg"
                  className="rounded-full h-14 px-10 text-base shadow-xl hover:shadow-zinc-200 transition-all hover:scale-105 active:scale-95 bg-zinc-900"
                >
                  Get Started for Free <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full h-14 px-8 text-base border-zinc-200 hover:bg-zinc-50 transition-all"
              >
                View Documentation
              </Button>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 bg-zinc-50 border-y border-zinc-100">
          <div className="container px-6 mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
              <div className="group p-8 rounded-3xl bg-white border border-zinc-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
                <div className="h-14 w-14 rounded-2xl bg-zinc-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Zap className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-zinc-900">Fast Setup</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Go-live in under 5 minutes. Just set your preferences, paste your copy, and embed
                  the script.
                </p>
              </div>

              <div className="group p-8 rounded-3xl bg-white border border-zinc-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
                <div className="h-14 w-14 rounded-2xl bg-zinc-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Shield className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-zinc-900">Safe & Secure</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Your data is encrypted and protected. We ensure the highest standards of data
                  privacy for your business.
                </p>
              </div>

              <div className="group p-8 rounded-3xl bg-white border border-zinc-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
                <div className="h-14 w-14 rounded-2xl bg-zinc-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <MessageSquare className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-zinc-900">Smart RAG</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Our advanced RAG technology ensures your bot always provides accurate answers
                  based on your knowledge base.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Section */}
        <section className="py-24">
          <div className="container px-6 mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-16 text-zinc-900 text-center">
              Everything you need to scale support
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-12 gap-x-8 text-left">
              {[
                'No coding required',
                'Custom branding',
                'Unlimited documents',
                'Gemini Pro 2.5 Support',
                'Lead generation',
                'Multilingual support',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="font-medium text-zinc-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-zinc-100 bg-zinc-50 text-center">
        <div className="container px-4 mx-auto">
          <p className="text-sm text-zinc-500">
            © {new Date().getFullYear()} AI Widget SaaS. Built for professional businesses.
          </p>
        </div>
      </footer>
    </div>
  );
}
