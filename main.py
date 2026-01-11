from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from passlib.context import CryptContext
from typing import List, Optional
from datetime import datetime
import database as db
import random

app = FastAPI()

# Database Init
db.init_db()

# Security
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# Models for API
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str

class GroupCreate(BaseModel):
    name: str

class ExpenseCreate(BaseModel):
    amount: float
    category: str
    description: str
    group_id: int
    paid_by_id: int

class ExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None

# Dependency
def get_db():
    session = db.SessionLocal()
    try:
        yield session
    finally:
        session.close()

# API Routes
@app.post("/api/register")
def register(user: UserCreate, session: Session = Depends(get_db)):
    db_user = session.query(db.User).filter(db.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = pwd_context.hash(user.password)
    new_user = db.User(username=user.username, password_hash=hashed_password)
    session.add(new_user)
    session.commit()
    return {"message": "User created successfully"}

@app.post("/api/login")
def login(user: UserCreate, session: Session = Depends(get_db)):
    db_user = session.query(db.User).filter(db.User.username == user.username).first()
    if not db_user or not pwd_context.verify(user.password, db_user.password_hash):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"access_token": "fake-jwt-token", "token_type": "bearer", "user_id": db_user.id, "username": db_user.username}

class GroupOut(BaseModel):
    id: int
    name: str
    code: str
    
    class Config:
        orm_mode = True

@app.get("/api/groups/{user_id}", response_model=List[GroupOut])
def get_groups(user_id: int, session: Session = Depends(get_db)):
    memberships = session.query(db.GroupMember).filter(db.GroupMember.user_id == user_id).all()
    # Explicitly filter out None groups if any relational integrity issues
    groups = [m.group for m in memberships if m.group]
    return groups

@app.post("/api/groups", response_model=GroupOut)
def create_group(group: GroupCreate, user_id: int, session: Session = Depends(get_db)): # Simplified: pass user_id in query for validation speed
    code = "GRP" + str(random.randint(1000, 9999))
    new_group = db.Group(name=group.name, code=code)
    session.add(new_group)
    session.commit()
    
    # Add creator as member
    member = db.GroupMember(user_id=user_id, group_id=new_group.id)
    session.add(member)
    session.commit()
    return new_group

@app.get("/api/group/{group_id}/expenses")
def get_expenses(group_id: int, session: Session = Depends(get_db)):
    expenses = session.query(db.Expense).filter(db.Expense.group_id == group_id).all()
    # Serialize manually for simplicity or use Pydantic models
    result = []
    for e in expenses:
        result.append({
            "id": e.id,
            "amount": e.amount,
            "category": e.category,
            "description": e.description,
            "date": e.created_at.strftime("%Y-%m-%d"),
            "paid_by": e.paid_by.username
        })
    return result

@app.post("/api/expenses")
def add_expense(expense: ExpenseCreate, session: Session = Depends(get_db)):
    new_expense = db.Expense(
        amount=expense.amount,
        category=expense.category,
        description=expense.description,
        group_id=expense.group_id,
        paid_by_id=expense.paid_by_id
    )
    session.add(new_expense)
    session.commit()
    session.add(new_expense)
    session.commit()
    return {"message": "Expense added"}

@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int, session: Session = Depends(get_db)):
    expense = session.query(db.Expense).filter(db.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    session.delete(expense)
    session.commit()
    return {"message": "Expense deleted"}

@app.put("/api/expenses/{expense_id}")
def update_expense(expense_id: int, expense_update: ExpenseUpdate, session: Session = Depends(get_db)):
    expense = session.query(db.Expense).filter(db.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense_update.amount is not None:
        expense.amount = expense_update.amount
    if expense_update.category is not None:
        expense.category = expense_update.category
    if expense_update.description is not None:
        expense.description = expense_update.description
        
    session.commit()
    return {"message": "Expense updated"}

@app.post("/api/groups/join")
def join_group(code: str, user_id: int, session: Session = Depends(get_db)):
    group = session.query(db.Group).filter(db.Group.code == code).first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")
    
    exists = session.query(db.GroupMember).filter(db.GroupMember.user_id == user_id, db.GroupMember.group_id == group.id).first()
    if exists:
        return {"message": "Already a member"}
        
    member = db.GroupMember(user_id=user_id, group_id=group.id)
    session.add(member)
    session.commit()
    return {"message": "Joined group successfully", "group": group}

# Serve Static Files and Frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    return FileResponse("templates/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
