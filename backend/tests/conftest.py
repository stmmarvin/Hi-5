import os

# De tests draaien op een lege database in het geheugen, los van PostgreSQL.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-" + "x" * 40
os.environ["APP_ENV"] = "development"
os.environ["SIMULATION_MODE"] = "true"
os.environ["SEED_BERT_PASSWORD"] = "bert-test-wachtwoord"
os.environ["SEED_RECEPTIE_PASSWORD"] = "receptie-test-wachtwoord"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine
from app.main import app
from app.security import login_limiter

HEADERS = {"X-Requested-With": "groene-weide"}


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    login_limiter.reset()
    with TestClient(app, headers=HEADERS) as c:
        yield c


def login(client, username="receptie", password="receptie-test-wachtwoord"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


@pytest.fixture()
def receptie(client):
    assert login(client).status_code == 200
    return client


@pytest.fixture()
def bert(client):
    assert login(client, "bert", "bert-test-wachtwoord").status_code == 200
    return client
