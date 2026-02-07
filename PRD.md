Vercel AI SDK Python Streaming Starter structure ကို အခြေခံပြီး Next.js (Dashboard/Frontend) နဲ့ FastAPI (AI Backend) တို့ကို ပေါင်းစပ်ထားတဲ့ Embedded Chatbot Widget အတွက် အပြည့်စုံဆုံး PRD.md ကို အောက်ပါအတိုင်း ရေးသားပေးလိုက်ပါတယ်။

Product Requirements Document (PRD): AI Chatbot Widget SaaS

1. Project Overview
   လုပ်ငန်းရှင်များ (Business Owners) မိမိတို့၏ Website များတွင် Gemini AI Chatbot ကို လွယ်ကူစွာ ထည့်သွင်းအသုံးပြုနိုင်မည့် SaaS Platform ဖြစ်သည်။ Admin မှ Account ဖွင့်ပေးပြီးနောက် လုပ်ငန်းရှင်သည် မိမိ Bot ကို စိတ်ကြိုက်ပြင်ဆင်နိုင်မည်။

2. Target Audience
   Online Shops / E-commerce websites.

Service providers (Clinics, Agencies, etc.).

Customer Support လိုအပ်သော လုပ်ငန်းငယ်များ။

3. Tech Stack
   Frontend (Dashboard/Auth): Next.js (App Router), Tailwind CSS, Shadcn UI.

Backend (AI Logic): FastAPI (Python) located in /api.

Database: PostgreSQL (Supabase) via Prisma ORM.

Authentication: Better-Auth (Next.js server-side).

AI Engine: Google Gemini 1.5 Flash via LangChain Python.

Streaming: Vercel AI SDK (Data Stream Protocol).

4. Key Features
   4.1 Admin Capabilities
   User Management: Business Owner များအတွက် Email/Password ဖြင့် အကောင့်များ ဆောက်ပေးခြင်း (Public Sign-up ကို ပိတ်ထားမည်)။

Tenant Monitoring: မည်သည့် လုပ်ငန်းရှင်က AI ကို မည်မျှအသုံးပြုနေသည်ကို စောင့်ကြည့်ခြင်း။

4.2 Business Owner Dashboard
Bot Customization: Bot ၏ အမည်၊ Welcome Message နှင့် Widget ၏ အရောင် (Primary Color) ကို ပြင်ဆင်နိုင်ခြင်း။

Knowledge Base: PDF သို့မဟုတ် စာသားများတင်၍ AI ကို Train ပေးခြင်း (RAG)။

Installation: Website တွင် ထည့်သွင်းရန် JavaScript Snippet ကို Copy ယူနိုင်ခြင်း။

Analytics: Chat history များကို ပြန်လည်ကြည့်ရှုနိုင်ခြင်း။

4.3 Embeddable Chat Widget
Floating Bubble: Website ၏ အောက်ခြေတွင် ပေါ်နေမည့် Chat icon။

Iframe UI: Next.js မှ သီးသန့် render လုပ်ပေးမည့် Lightweight Chat Interface။

AI Streaming: AI က စာပြန်ရာတွင် တစ်လုံးချင်းစီ စာရိုက်ပြသလို (Streaming) ပေါ်လာခြင်း။

Session Persistence: Website ကို Refresh လုပ်သော်လည်း Chat မှတ်တမ်း မပျောက်ခြင်း။

5. System Architecture & Data Flow
   Loader Script: Client Website တွင် <script> ထည့်လိုက်သည်နှင့် Iframe တစ်ခုကို Load လုပ်ကာ bot_id ကို Backend သို့ ပို့သည်။

Streaming Request: Chat UI မှတစ်ဆင့် Message ပို့လျှင် Next.js က /api/chat (FastAPI) သို့ လှမ်းခေါ်သည်။

RAG Process: FastAPI သည် bot_id အလိုက် Knowledge Base ထဲတွင် ရှာဖွေပြီး Gemini သို့ Prompt ပေးပို့သည်။

Data Stream: Gemini ၏ အဖြေကို Vercel AI SDK protocol အတိုင်း Widget ဆီသို့ Stream ပြုလုပ်ပေးသည်။

6. Database Schema (Prisma)
   Code snippet
   model User {
   id String @id @default(cuid())
   email String @unique
   role String @default("USER") // ADMIN or USER
   bots Bot[]
   }

model Bot {
id String @id @default(cuid())
name String
systemPrompt String @db.Text
primaryColor String @default("#3b82f6")
user User @relation(fields: [userId], references: [id])
userId String
documents Document[]
}

model Document {
id String @id @default(cuid())
content String @db.Text
botId String
bot Bot @relation(fields: [botId], references: [id])
} 7. Success Metrics
Low Latency: AI စတင်စာပြန်သည့်အချိန် (Time to First Token) သည် ၂ စက္ကန့်အောက် ဖြစ်ရမည်။

Seamless UI: Widget သည် မည်သည့် Mobile/Desktop website ပေါ်တွင်မဆို Responsive ဖြစ်ရမည်။

Scalability: Admin Panel မှတစ်ဆင့် လုပ်ငန်းရှင်ပေါင်း ၁၀၀ ကျော်ကို စီမံခန့်ခွဲနိုင်ရမည်။

8. Security Considerations
   CORS Policy: /api/chat ကို သတ်မှတ်ထားသော Domain များမှသာ ခေါ်ယူခွင့်ပေးရန် (သို့မဟုတ်) Bot ID ကို Validate လုပ်ရန်။

Admin-Only Access: User ဖန်တီးသည့် API ကို Admin Role ရှိသူသာ ခေါ်ယူခွင့်ပေးရန်။
