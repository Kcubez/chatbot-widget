from typing import List, Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, Text

def get_utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

class Bot(SQLModel, table=True):
    __tablename__ = "bot"
    id: str = Field(primary_key=True)
    name: str
    systemPrompt: str = Field(sa_column=Column(Text, nullable=False))
    primaryColor: str = Field(default="#3b82f6")
    userId: str
    createdAt: datetime = Field(default_factory=get_utc_now)
    updatedAt: datetime = Field(default_factory=get_utc_now)
    
    documents: List["Document"] = Relationship(back_populates="bot")
    conversations: List["Conversation"] = Relationship(back_populates="bot")

class Document(SQLModel, table=True):
    __tablename__ = "document"
    id: str = Field(primary_key=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    botId: str = Field(foreign_key="bot.id")
    createdAt: datetime = Field(default_factory=get_utc_now)
    updatedAt: datetime = Field(default_factory=get_utc_now)
    
    bot: Optional[Bot] = Relationship(back_populates="documents")

class Conversation(SQLModel, table=True):
    __tablename__ = "conversation"
    id: str = Field(primary_key=True)
    botId: str = Field(foreign_key="bot.id")
    createdAt: datetime = Field(default_factory=get_utc_now)
    
    bot: Optional[Bot] = Relationship(back_populates="conversations")
    messages: List["Message"] = Relationship(back_populates="conversation")

class Message(SQLModel, table=True):
    __tablename__ = "message"
    id: str = Field(primary_key=True)
    conversationId: str = Field(foreign_key="conversation.id")
    role: str
    content: str = Field(sa_column=Column(Text, nullable=False))
    createdAt: datetime = Field(default_factory=get_utc_now)
    
    conversation: Optional[Conversation] = Relationship(back_populates="messages")
