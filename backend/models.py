from typing import List, Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, Text

class Bot(SQLModel, table=True):
    __tablename__ = "bot"
    id: str = Field(primary_key=True)
    name: str
    systemPrompt: str = Field(sa_column=Column(Text, nullable=False))
    primaryColor: str = Field(default="#3b82f6")
    userId: str
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    
    documents: List["Document"] = Relationship(back_populates="bot")

class Document(SQLModel, table=True):
    __tablename__ = "document"
    id: str = Field(primary_key=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    botId: str = Field(foreign_key="bot.id")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    
    bot: Optional[Bot] = Relationship(back_populates="documents")
