"""Health probes."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api.deps import ContainerDep

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready", summary="Readiness probe (required configuration present)")
async def ready(c: ContainerDep) -> JSONResponse:
    checks = {"uacapi": bool(c.settings.uacapi_endpoint), "llm": c.llm.configured}
    ok = all(checks.values())
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "degraded", "checks": checks},
    )
