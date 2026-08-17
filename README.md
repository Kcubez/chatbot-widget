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

## 📘 Messenger Setup Guide for Clients

To connect a Messenger sale bot to a Facebook Page, the client must prepare Meta access first.

### 1. Create or Use a Meta Developer Account

The client should log in to [Meta for Developers](https://developers.facebook.com/) with the Facebook account that manages their business Page.

If they do not already have a Meta Developer account, they need to register one. Meta may ask for basic profile verification before the account can be used for app access.

### 2. Accept the Developer Invitation

The platform owner will invite the client's Facebook account to the Meta app.

The client must accept the invitation from Meta before Messenger connection can work. They can usually find the invitation in:

- Meta for Developers notifications
- Facebook notifications
- Email from Meta

Until the invitation is accepted, the client may not see the app or may not be able to grant Page permissions.

### 3. Confirm Facebook Page Access

The client must have admin or full control access to the Facebook Page they want to connect.

If the Page is managed through Meta Business Suite, they should check that their Facebook account has permission to manage:

- Page messaging
- Page settings
- Page access / business asset access

### 4. Connect the Page in the Dashboard

After accepting the invitation, the client can open the dashboard and connect Messenger from the bot settings.

During connection, they should select the correct Facebook Page and approve the requested permissions. After approval, the bot will receive the Page access token and use it to send and receive Messenger messages.

### 5. Important Notes

- One Messenger bot should be connected to one Facebook Page at a time.
- If the wrong Page is selected, disconnect and reconnect Messenger with the correct Page.
- If Meta permissions are missing, reconnecting will not fix it until the client's Facebook/Page access is corrected in Meta.

---

## 🔐 Authentication Levels

- **Admin:** Can create business owner accounts and monitor system-wide usage.
- **Business Owner:** Can create/edit bots, upload knowledge, and connect Facebook pages.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">Made with ❤️ for modern businesses</p>
