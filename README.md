# PRO200 Voice Controlled Timer Overviwe

A web application where users can create, run, and control timers using voice commands. The app uses AI to interprete natural language into a command for the application to process.

&nbsp;

-------------------------------------------

# Prerequisites

### Make sure you have downloaded and installed [NodeJS](https://nodejs.org/en/download)

### Install [Git](https://git-scm.com/download/win) (Optional)

### Create a MongoDB Container [MongoDB](https://www.mongodb.com/)


&nbsp;

-------------------------------------------

# Setting Up

clone using

git clone https://github.com/Edward-1100/PRO200.git
cd PRO200/backend

#### OR

Click code and then download zip at the top of the page.

&nbsp;

Install dependecies with powershell by making sure are in /backend and running
- npm install

&nbsp;

Make a file named ".env" in /backend, with these variables filled out:

 - PORT = 4000

 - MONGO_URI= mongodb://localhost:27017/voice_timer (example)

 - JWT_SECRET= "long random string"

 - PEPPER= "long random string, or a word/sentence you really like"

### Finally, While In /backend Start The Server With
- node server.js
### And Go To http://localhost:4000 In Your Browser

&nbsp;

-------------------------------------------

# Local AI

Use a.py to install the local AI model that you want. The project was designed to use Llama-3.2-3B-Instruct

 - https://huggingface.co/meta-llama/Llama-3.2-3B
 - https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f32_1-MLC
 - [.wasm for the model](https://github.com/mlc-ai/binary-mlc-llm-libs/blob/main/web-llm-models/v0_2_48/Llama-3.2-3B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm)


&nbsp;

-------------------------------------------

# API references:

POST /api/auth/register body: {username, email, password}

POST /api/auth/login body: {identifier, password} (identifier = username OR email)

POST /api/command body: {clientId, aiCommand}
