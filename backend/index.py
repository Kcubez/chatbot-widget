import os
import json
from typing import List, Optional
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from pydantic import BaseModel
from datetime import datetime
from dotenv import load_dotenv
from sqlmodel import select
from sqlalchemy.orm import selectinload
from db import engine, AsyncSession
from models import Bot, Document, Conversation, Message

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
    chatId: Optional[str] = None

@app.get("/api/python")
def hello_world():
    return {"message": "Hello from FastAPI with SQLModel"}

@app.post("/api/chat")
async def chat_endpoint(data: ChatMessage):
    print(f"Chat request for botId: {data.botId}, chatId: {data.chatId}")
    
    async with AsyncSession(engine) as session:
        # Fetch Bot settings and knowledge
        statement = select(Bot).where(Bot.id == data.botId).options(selectinload(Bot.documents))
        result = await session.exec(statement)
        bot = result.first()

        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")

        # Handle Conversation persistence
        if data.chatId:
            conv_statement = select(Conversation).where(Conversation.id == data.chatId)
            conv_result = await session.exec(conv_statement)
            conversation = conv_result.first()
            
            if not conversation:
                conversation = Conversation(id=data.chatId, botId=data.botId)
                session.add(conversation)
                await session.commit()
                await session.refresh(conversation)
            
            # Save the latest user message
            if data.messages:
                last_msg = data.messages[-1]
                if last_msg['role'] == 'user':
                    user_msg = Message(
                        id=f"msg_{datetime.utcnow().timestamp()}",
                        conversationId=data.chatId,
                        role="user",
                        content=last_msg['content']
                    )
                    session.add(user_msg)
                    await session.commit()

    # Prepare messages for AI
    messages = [SystemMessage(content=bot.systemPrompt)]
    
    if bot.documents:
        context = "\n".join([doc.content for doc in bot.documents])
        messages[0].content += f"\n\nContext:\n{context}"
    
    for msg in data.messages:
        if msg['role'] == 'user':
            messages.append(HumanMessage(content=msg['content']))
        elif msg['role'] == 'assistant':
            messages.append(AIMessage(content=msg['content']))

    async def generate():
        full_response = ""
        try:
            async for chunk in llm.astream(messages):
                if chunk.content:
                    full_response += chunk.content
                    yield f'0:{json.dumps(chunk.content)}\n'
            
            # Save assistant response after streaming completes
            if data.chatId:
                async with AsyncSession(engine) as session:
                    assistant_msg = Message(
                        id=f"ai_{datetime.utcnow().timestamp()}",
                        conversationId=data.chatId,
                        role="assistant",
                        content=full_response
                    )
                    session.add(assistant_msg)
                    await session.commit()
        except Exception as e:
            yield f'3:{json.dumps(str(e))}\n'

    return StreamingResponse(generate(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
