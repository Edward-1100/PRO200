# PRO200

Prerequisites:

Node.js (v18+)

npm

MongoDB

---------------------------------------------

backend/server.js: main server, SSE, command parsing

backend/routes/auth.js: register/login (JWT)

backend/routes/timers.js: saved timers CRUD

backend/models/: Holds mongoose schemas

frontend/index.html + frontend/script.js: UI and client behavior

---------------------------------------------

API references:

POST /api/auth/register body: {username, email, password}

POST /api/auth/login body: {identifier, password} (identifier = username OR email)

GET/POST/DELETE /api/timers saved timers (requires Authorization: Bearer <token>)

POST /api/command body: {clientId, aiCommand}

GET /events?clientId= Server-Sent Events for time, reminder, alarm, message, state

GET /api/state?clientId= current timer state


---------------------------------------------

Install AI Models inside of backend\ai_models

Models are served from backend/ai_models/ at /models/

frontend/script.js has constants for WEBLLM_MODULE and WEBLLM_MODEL_ID. Change the model id there if you want to use a different AI.

Project designed to uses llama-3.1-8b-instruct with WebLLM
