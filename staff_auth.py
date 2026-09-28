#!/usr/bin/env python3
"""
VetCare · staff_auth.py
=======================
Almacén de credenciales del personal de la veterinaria.

En lugar de guardar las contraseñas en texto plano dentro de app.js (donde
cualquiera podía leerlas con "Ver código fuente"), este módulo guarda solo un
HASH de cada contraseña (PBKDF2-HMAC-SHA256 + sal aleatoria + 200,000
iteraciones). Nunca se almacena la contraseña original.

Flujo de trabajo
----------------
1. Administras usuarios desde la terminal (contraseña oculta al escribir):
       python staff_auth.py add "Nombre Apellido" "Rol"
       python staff_auth.py passwd "Nombre Apellido"
       python staff_auth.py remove "Nombre Apellido"
       python staff_auth.py list
       python staff_auth.py verify "Nombre Apellido"

2. Cada cambio regenera automáticamente `staff-auth.js`, el archivo que carga
   staff.html. El navegador verifica la contraseña con Web Crypto (mismos
   parámetros PBKDF2), así que funciona en GitHub Pages sin servidor.

Rendimiento: staff-auth.js solo se carga en staff.html (no en las demás
páginas) y los datos de acceso salen de app.js, que ahora pesa menos.

Solo usa la biblioteca estándar de Python 3.8+ (no requiere pip install).
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import hmac
import json
import secrets
import sys
from pathlib import Path

ITERATIONS = 200_000          # Debe coincidir con STAFF_ITERATIONS en app.js
HASH_BYTES = 32               # SHA-256
BASE_DIR = Path(__file__).resolve().parent
DB_FILE = BASE_DIR / "staff_users.json"   # almacén (solo hashes)
JS_FILE = BASE_DIR / "staff-auth.js"      # archivo que lee el navegador


# ---------------------------------------------------------------- hashing ----
def hash_password(password: str, salt: bytes | None = None) -> dict:
    """Devuelve {salt, hash, iter} en base64 para una contraseña."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, ITERATIONS, HASH_BYTES
    )
    return {
        "salt": base64.b64encode(salt).decode(),
        "hash": base64.b64encode(digest).decode(),
        "iter": ITERATIONS,
    }


def check_password(password: str, record: dict) -> bool:
    """Compara en tiempo constante (evita ataques por temporización)."""
    salt = base64.b64decode(record["salt"])
    expected = base64.b64decode(record["hash"])
    got = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, record.get("iter", ITERATIONS), len(expected)
    )
    return hmac.compare_digest(got, expected)


# ---------------------------------------------------------------- storage ----
def load_users() -> list[dict]:
    if not DB_FILE.exists():
        return []
    return json.loads(DB_FILE.read_text(encoding="utf-8"))


def save_users(users: list[dict]) -> None:
    """Guarda el almacén y regenera staff-auth.js para el navegador."""
    DB_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Solo se exponen usuario, rol y hash (nunca contraseñas en claro).
    public = json.dumps(users, ensure_ascii=False, separators=(",", ":"))
    JS_FILE.write_text(
        "/* Generado por staff_auth.py — NO editar a mano. Solo contiene hashes. */\n"
        f"window.STAFF_AUTH={public};\n",
        encoding="utf-8",
    )


def find(users: list[dict], name: str) -> dict | None:
    return next((u for u in users if u["user"].lower() == name.strip().lower()), None)


def ask_password(confirm: bool = True) -> str:
    pw = getpass.getpass("Contraseña: ")
    if len(pw) < 8:
        sys.exit("Error: usa al menos 8 caracteres.")
    if confirm and pw != getpass.getpass("Repite la contraseña: "):
        sys.exit("Error: las contraseñas no coinciden.")
    return pw


# ------------------------------------------------------------------- CLI -----
def cmd_add(a):
    users = load_users()
    if find(users, a.user):
        sys.exit(f"Error: '{a.user}' ya existe. Usa 'passwd' para cambiar su contraseña.")
    users.append({"user": a.user.strip(), "nombre": a.rol.strip(), **hash_password(ask_password())})
    save_users(users)
    print(f"✔ Usuario '{a.user}' agregado. Se regeneró {JS_FILE.name}.")


def cmd_passwd(a):
    users = load_users()
    u = find(users, a.user)
    if not u:
        sys.exit(f"Error: no existe '{a.user}'.")
    u.update(hash_password(ask_password()))
    save_users(users)
    print(f"✔ Contraseña de '{u['user']}' actualizada.")


def cmd_remove(a):
    users = load_users()
    u = find(users, a.user)
    if not u:
        sys.exit(f"Error: no existe '{a.user}'.")
    users.remove(u)
    save_users(users)
    print(f"✔ Usuario '{u['user']}' eliminado.")


def cmd_list(_):
    for u in load_users():
        print(f"- {u['user']:<20} {u['nombre']}")


def cmd_verify(a):
    u = find(load_users(), a.user)
    ok = bool(u) and check_password(getpass.getpass("Contraseña: "), u)
    print("✔ Credenciales correctas" if ok else "✘ Usuario o contraseña incorrectos")
    sys.exit(0 if ok else 1)


def cmd_export(_):
    save_users(load_users())
    print(f"✔ {JS_FILE.name} regenerado.")


def main():
    p = argparse.ArgumentParser(description="Gestión de credenciales del staff de VetCare")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, fn, args in [
        ("add", cmd_add, ["user", "rol"]),
        ("passwd", cmd_passwd, ["user"]),
        ("remove", cmd_remove, ["user"]),
        ("verify", cmd_verify, ["user"]),
    ]:
        sp = sub.add_parser(name)
        for arg in args:
            sp.add_argument(arg)
        sp.set_defaults(fn=fn)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    sub.add_parser("export").set_defaults(fn=cmd_export)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
