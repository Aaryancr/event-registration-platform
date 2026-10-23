from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.modules.auth.routes import router as auth_router
from app.modules.events.routes import router as events_router
from app.modules.registrations.routes import router as registrations_router

settings = get_settings()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Scalable event registration and ticketing platform REST API.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include feature routers
app.include_router(
    auth_router,
    prefix=f"{settings.API_V1_PREFIX}/auth",
    tags=["Authentication"],
)

app.include_router(
    events_router,
    prefix=f"{settings.API_V1_PREFIX}/events",
    tags=["Events"],
)

app.include_router(
    registrations_router,
    prefix=settings.API_V1_PREFIX,
    tags=["Registrations"],
)


@app.get("/", tags=["Root"])
def root():
    """Root endpoint welcoming developers and linking to interactive docs."""
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "docs": "/docs",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/health", tags=["Health"])
@app.get(f"{settings.API_V1_PREFIX}/health", tags=["Health"])
def health_check():
    """Health check endpoint used by Docker healthchecks and monitoring."""
    return {
        "status": "healthy",
        "service": "backend",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
    }
