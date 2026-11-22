import pytest

from api._lib.auth_core import Principal
from api._lib.auth import require_delphina
from api.index import app


@pytest.fixture
def authed_app():
    """The app with Delphina auth satisfied, for tests about endpoint behavior."""
    app.dependency_overrides[require_delphina] = lambda: Principal(email="test@delphina.example", is_admin=False)
    yield app
    app.dependency_overrides.clear()
