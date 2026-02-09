import os
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Initialize Gemini
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    streaming=False  # Vercel serverless doesn't support streaming well
)

def get_db_connection():
    """Create a database connection"""
    database_url = os.getenv("DATABASE_URL")
    return psycopg2.connect(database_url)

def get_bot(bot_id: str):
    """Fetch bot from database"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT id, name, "systemPrompt", "primaryColor" FROM bot WHERE id = %s', (bot_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if row:
        return {"id": row[0], "name": row[1], "systemPrompt": row[2], "primaryColor": row[3]}
    return None

def get_documents(bot_id: str):
    """Fetch documents for a bot"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT content FROM document WHERE "botId" = %s', (bot_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [row[0] for row in rows]

def save_conversation(chat_id: str, bot_id: str):
    """Create conversation if not exists"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT id FROM conversation WHERE id = %s', (chat_id,))
    if not cur.fetchone():
        cur.execute(
            'INSERT INTO conversation (id, "botId", "createdAt") VALUES (%s, %s, %s)',
            (chat_id, bot_id, datetime.now(timezone.utc).replace(tzinfo=None))
        )
        conn.commit()
    cur.close()
    conn.close()

def save_message(chat_id: str, role: str, content: str):
    """Save a message to the database"""
    conn = get_db_connection()
    cur = conn.cursor()
    now = datetime.now(timezone.utc)
    msg_id = f"{role}_{now.timestamp()}"
    cur.execute(
        'INSERT INTO message (id, "conversationId", role, content, "createdAt") VALUES (%s, %s, %s, %s, %s)',
        (msg_id, chat_id, role, content, now.replace(tzinfo=None))
    )
    conn.commit()
    cur.close()
    conn.close()

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        
        bot_id = data.get('botId')
        chat_id = data.get('chatId')
        messages = data.get('messages', [])
        
        # Fetch bot
        bot = get_bot(bot_id)
        if not bot:
            self.send_response(404)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Bot not found"}).encode())
            return
        
        # Get documents for context
        documents = get_documents(bot_id)
        
        # Handle conversation persistence
        if chat_id:
            save_conversation(chat_id, bot_id)
            # Save user message
            if messages:
                last_msg = messages[-1]
                if last_msg.get('role') == 'user':
                    save_message(chat_id, 'user', last_msg.get('content', ''))
        
        # Prepare messages for AI
        ai_messages = [SystemMessage(content=bot['systemPrompt'])]
        if documents:
            context = "\n".join(documents)
            ai_messages[0].content += f"\n\nContext:\n{context}"
        
        for msg in messages:
            if msg['role'] == 'user':
                ai_messages.append(HumanMessage(content=msg['content']))
            elif msg['role'] == 'assistant':
                ai_messages.append(AIMessage(content=msg['content']))
        
        # Generate response
        try:
            response = llm.invoke(ai_messages)
            ai_response = response.content
            
            # Save assistant message
            if chat_id:
                save_message(chat_id, 'assistant', ai_response)
            
            # Return in Vercel AI SDK format
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f'0:{json.dumps(ai_response)}\n'.encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
