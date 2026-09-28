# VetCare · Sistema médico veterinario

Plataforma web (HTML + CSS + JavaScript) para agendar citas, consultar expedientes y administrar inventario.
Funciona en computadora y celular, sin servidor.

**Demo:** https://TU-USUARIO.github.io/vetcare/

## Novedades
- **Contraseñas del staff protegidas** (`staff_auth.py`): solo se guardan hashes PBKDF2-SHA256 con sal, nunca texto plano.
- **Comprobante de cita en PDF**: al agendar (o desde el botón *PDF* de cada cita) se descarga el comprobante.

## Administrar usuarios del staff
Requiere Python 3.8+ (sin instalar nada más):

```bash
python staff_auth.py list
python staff_auth.py add "Nombre Apellido" "Rol"
python staff_auth.py passwd "Nombre Apellido"
python staff_auth.py remove "Nombre Apellido"
```
Cada comando regenera `staff-auth.js`. Después haz commit y push para publicar los cambios.

## Ejecutar en local
```bash
python -m http.server 8000
```
Abre http://localhost:8000
