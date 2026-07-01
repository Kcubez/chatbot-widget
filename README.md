# 🤖 OmniBot - AI Chatbot SaaS

A premium, full-stack AI Chatbot Widget SaaS that allows business owners to embed a custom-trained AI assistant into their websites. Built with **Next.js**, **FastAPI**, and **Google Gemini 2.5 Flash**.

![Banner](https://images.unsplash.com/photo-1531746790731-6c087fecd65a?q=80&w=2000&auto=format&fit=crop)

## 🌟 Key Features

### 🏢 For Business Owners

- **Custom AI Training (RAG):** Upload PDF documents or paste text to train your bot on your specific business knowledge.
- **Visual Customization:** Customize bot name, welcome message, and primary theme colors to match your brand.
- **Management Dashboard:** A sleek, premium dashboard to manage multiple bots and monitor chat histories.
- **One-Click Installation:** Simple JavaScript snippet to embed the widget on any website.
- **Messenger Integration:** Connect your AI bot directly to your Facebook Page for automated customer support.

### 💬 For End Users

- **AI Streaming:** Real-time, character-by-character message streaming for a natural chat experience.
- **Lightweight Widget:** A high-performance, responsive floating chat bubble.
- **Session Persistence:** Chat history is saved across page refreshes.

---

## 🛠 Tech Stack

| Layer         | Technology                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**  | [Next.js 15](https://nextjs.org/) (App Router), [Tailwind CSS](https://tailwindcss.com/), [Shadcn/UI](https://ui.shadcn.com/) |
| **Backend**   | [FastAPI](https://fastapi.tiangolo.com/) (Python), [LangChain](https://js.langchain.com/)                                     |
| **AI Engine** | [Google Gemini 1.5 Flash](https://deepmind.google/technologies/gemini/)                                                       |
| **Database**  | [PostgreSQL](https://www.postgresql.org/) ([Supabase](https://supabase.com/)), [Prisma ORM](https://www.prisma.io/)           |
| **Auth**      | [Better-Auth](https://www.better-auth.com/)                                                                                   |
| **Streaming** | [Vercel AI SDK](https://sdk.vercel.ai/)                                                                                       |

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js 20+
- Python 3.10+
- PostgreSQL Database (Supabase recommended)
- Google AI (Gemini) API Key

### 2. Clone the Repository

```bash
git clone https://github.com/your-username/chatbot-widget.git
cd chatbot-widget
```

### 3. Frontend Setup (Next.js)

```bash
npm install
npx prisma generate
npm run dev
```

### 4. Backend Setup (FastAPI)

```bash
# Create a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the backend server
uvicorn backend.index:app --reload --port 8000
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory and add the following:

```env
# Database
DATABASE_URL="your-postgresql-connection-string"

# Better Auth
BETTER_AUTH_SECRET="your-generated-secret"
BETTER_AUTH_URL="http://localhost:3000"

# AI Core
GOOGLE_API_KEY="your-gemini-api-key"

# Facebook Integration (Optional)
NEXT_PUBLIC_FB_APP_ID="your-fb-app-id"
FB_APP_SECRET="your-fb-app-secret"

# Public URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 📦 Project Structure

```text
├── backend/            # FastAPI AI Backend (Python)
│   ├── index.py        # Main entry point & chat logic
│   ├── models.py       # RAG & LLM definitions
│   └── db.py           # Database integration for backend
├── src/                # Next.js Frontend (TypeScript)
│   ├── app/            # App Router (Dashboard & API)
│   ├── components/     # UI Components (Shadcn/UI)
│   ├── lib/            # Shared utilities & actions
│   └── widget/         # Widget-specific logic
├── prisma/             # Database Schema
├── public/             # Static assets (including widget-loader.js)
└── requirements.txt    # Python dependencies
```

---

## 🔌 Widget Installation

To embed the chatbot on your website, copy the following snippet and paste it into your HTML's `<head>` or before the closing `</body>` tag:

```html
<script src="https://your-domain.com/widget-loader.js" data-bot-id="YOUR_BOT_ID" defer></script>
```

---

## 🔐 Authentication Levels

- **Admin:** Can create business owner accounts and monitor system-wide usage.
- **Business Owner:** Can create/edit bots, upload knowledge, and connect Facebook pages.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">Made with ❤️ for modern businesses</p>
