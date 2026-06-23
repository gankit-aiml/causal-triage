# TriadCausal-Command

## Instructions to Run

1. **Add your Gemini API Key:**
   Open `backend/.env` and replace `your_gemini_api_key_here` with your actual Google Gemini API Key.
   Also, ensure you have placed `sota_urban_causal_weights.pth` and `node_coordinates.csv` into the `backend/` directory if you have them.

2. **Start the Backend:**
   Open a terminal, navigate to the `backend` directory, and start the FastAPI server:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

3. **Start the Frontend:**
   Open another terminal, navigate to the `frontend` directory, and start the Next.js app:
   ```bash
   cd frontend
   npm run dev
   ```

4. **View the Dashboard:**
   Open your browser and navigate to `http://localhost:3000`. You can test it by searching for a location (e.g. "MG Road, Bengaluru") and clicking "Execute Causal Simulation".
