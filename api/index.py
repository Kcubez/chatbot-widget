import os
import json
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from pydantic import BaseModel
from dotenv import load_dotenv
from sqlmodel import select
from sqlalchemy.orm import selectinload
from db import engine, AsyncSession
from models import Bot, Document

load_dotenv()

app = FastAPI()

# Initialize Gemini
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", # Reverting to standard stable model for reliability
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    streaming=True
)

class ChatMessage(BaseModel):
    messages: list
    botId: str

@app.get("/api/python")
def hello_world():
    return {"message": "Hello from FastAPI with SQLModel"}

@app.post("/api/chat")
async def chat_endpoint(data: ChatMessage):
    print(f"Chat request for botId: {data.botId}")
    
    async with AsyncSession(engine) as session:
        # Fetch Bot settings and knowledge using SQLModel
        statement = select(Bot).where(Bot.id == data.botId).options(selectinload(Bot.documents))
        result = await session.exec(statement)
        bot = result.first()

    if not bot:
        print(f"Error: Bot {data.botId} not found in database")
        raise HTTPException(status_code=404, detail="Bot not found")

    messages = []
    
    # 1. Add System Prompt
    system_content = bot.systemPrompt
    
    # 2. Add Knowledge Base Context (Simplified RAG)
    if bot.documents:
        context = "\n".join([doc.content for doc in bot.documents])
        system_content += f"\n\nUse the following information to answer user queries if relevant:\n{context}"
    
    messages.append(SystemMessage(content=system_content))
    
    # 3. Add Conversation History
    for msg in data.messages:
        if msg['role'] == 'user':
            messages.append(HumanMessage(content=msg['content']))
        elif msg['role'] == 'assistant':
            messages.append(AIMessage(content=msg['content']))

    async def generate():
        print(f"Starting stream with {len(messages)} messages...")
        try:
            async for chunk in llm.astream(messages):
                if chunk.content:
                    # Format: 0:"text"\n (Vercel AI SDK Data Stream Protocol)
                    yield f'0:{json.dumps(chunk.content)}\n'
            print("Stream completed successfully")
        except Exception as e:
            print(f"Streaming error: {str(e)}")
            yield f'3:{json.dumps(str(e))}\n'

    return StreamingResponse(generate(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
