import uvicorn
from fastapi import FastAPI

from app.routers import document, feed, ransomware, search

app = FastAPI(
    title="Vysion Ransomware API",
    version="0.1",
    description="This is the API for the Vysion Ransomware API.",
    terms_of_service="http://example.com/terms/",
    contact={
        "name": "Support Team",
        "url": "http://example.com/contact/",
        "email": "support@example.com",
    }
)

router_prefix = "/api/v1"

@app.get("/")
async def index(): 
    return "Vysion Ransomware API"


app.include_router(document.documentroute, prefix=router_prefix)
app.include_router(feed.feedroute, prefix=router_prefix)
app.include_router(ransomware.ransomroute, prefix=router_prefix)
app.include_router(search.searchroute, prefix=router_prefix)


if __name__ == "__main__":
    uvicorn.run(app, host="172.20.0.1", port=8000)
