import time
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

from tools import get_current_weather, get_system_time
from langchain_ollama import ChatOllama
from langchain_core.messages import AIMessage
from langchain_core.prompts import PromptTemplate

prompt = PromptTemplate(
    template="""
    <|begin_of_text|>
    <|start_header_id|>system<|end_header_id|>
        You are an intelligent assistant designed to analyze user requests accurately.
        You must:
        - Always analyze the user's request to understand its intent.
        - Only use available tools when the request explicitly requires external information or actions you cannot perform directly.
        - Avoid using tools for general questions or tasks you can handle without external assistance (e.g., answering general knowledge questions, casual conversations, or creative requests).
        - When using a tool, ensure it is relevant to the request and provide the necessary arguments accurately.
        - If no tools are needed, respond directly to the user request without invoking any tools.
    <|eot_id|>
    <|start_header_id|>user<|end_header_id|>
        Conduct a comprehensive analysis of the request provided.
        USER REQUEST:\n\n {initial_request} \n\n
    <|eot_id|>
    <|start_header_id|>assistant<|end_header_id|>
    """,
    input_variables=["initial_request"],
)

tool_mapping = {
    'get_current_weather': get_current_weather,
    'get_system_time': get_system_time,
}

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_index():
    return FileResponse("static/index.html")

class BenchmarkRequest(BaseModel):
    base_url: str
    model_name: str
    sentence: str

@app.post("/benchmark")
async def benchmark(req: BenchmarkRequest):
    start_time = time.time()  # Start timing on the backend

    if not req.base_url or not req.model_name or not req.sentence:
        return JSONResponse(status_code=400, content={"success": False, "error": "Invalid input parameters."})

    try:
        model = ChatOllama(
            base_url=req.base_url,
            model=req.model_name,
            format="json"
        )
    except Exception as e:
        end_time = time.time()
        return JSONResponse(status_code=500, content={
            "success": False,
            "sentence": req.sentence,
            "error": f"Failed to initialize model: {str(e)}",
            "time_taken": int((end_time - start_time)*1000)
        })

    model_with_tools = model.bind_tools(
        tools=[get_current_weather, get_system_time],
    )
    agent_request_generator = prompt | model_with_tools

    try:
        result = agent_request_generator.invoke({"initial_request": req.sentence})
    except Exception as e:
        end_time = time.time()
        return JSONResponse(status_code=500, content={
            "success": False,
            "sentence": req.sentence,
            "error": f"Model invocation failed: {str(e)}",
            "time_taken": int((end_time - start_time)*1000)
        })

    if not isinstance(result, AIMessage):
        end_time = time.time()
        return {
            "success": False,
            "sentence": req.sentence,
            "error": "No valid AIMessage response from model.",
            "time_taken": int((end_time - start_time)*1000)
        }

    model_response = result.content.strip() if result.content else ""
    tool_calls_data = []
    success = True

    if hasattr(result, 'tool_calls') and result.tool_calls:
        for tc in result.tool_calls:
            tool_name = tc["name"]
            tool_args = tc["args"]
            try:
                tool_output = tool_mapping[tool_name].invoke(tool_args)
            except Exception as e:
                tool_output = f"Tool execution error: {str(e)}"
                success = False
            if "Tool execution error" in tool_output:
                success = False
            tool_calls_data.append({
                "name": tool_name,
                "args": tool_args,
                "output": tool_output
            })

    # Determine final success
    successful_tool_output = any(
        tc["output"] and "Tool execution error" not in tc["output"] 
        for tc in tool_calls_data
    )

    if model_response == "":
        if not successful_tool_output:
            success = False

    if not success:
        end_time = time.time()
        return {
            "success": False,
            "sentence": req.sentence,
            "tool_calls": tool_calls_data,
            "model_response": model_response,
            "error": "No successful response or tool execution.",
            "time_taken": int((end_time - start_time)*1000)
        }

    end_time = time.time()
    return {
        "success": True,
        "sentence": req.sentence,
        "tool_calls": tool_calls_data,
        "model_response": model_response,
        "time_taken": int((end_time - start_time)*1000) # Return time in ms
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8090)