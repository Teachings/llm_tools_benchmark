from fastapi import FastAPI
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
        You are a smart Agent.
        You are a master at understanding what a customer wants and utilize available tools only if you have to.
    <|eot_id|>
    <|start_header_id|>user<|end_header_id|>
        Conduct a comprehensive analysis of the request provided. \n
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

# Serve static files under /static
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
    if not req.base_url or not req.model_name or not req.sentence:
        return JSONResponse(status_code=400, content={"success": False, "error": "Invalid input parameters."})

    try:
        model = ChatOllama(
            base_url=req.base_url,
            model=req.model_name,
            format="json"
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "sentence": req.sentence,
            "error": f"Failed to initialize model: {str(e)}"
        })

    model_with_tools = model.bind_tools(
        tools=[get_current_weather, get_system_time],
    )
    agent_request_generator = prompt | model_with_tools

    try:
        result = agent_request_generator.invoke({"initial_request": req.sentence})
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "success": False,
            "sentence": req.sentence,
            "error": f"Model invocation failed: {str(e)}"
        })

    if not isinstance(result, AIMessage):
        return {"success": False, "sentence": req.sentence, "error": "No valid AIMessage response from model."}

    # Extract tool calls
    tool_calls_data = []
    if hasattr(result, 'tool_calls') and result.tool_calls:
        for tc in result.tool_calls:
            tool_name = tc["name"]
            tool_args = tc["args"]
            try:
                tool_output = tool_mapping[tool_name].invoke(tool_args)
            except Exception as e:
                tool_output = f"Tool execution error: {str(e)}"
            tool_calls_data.append({
                "name": tool_name,
                "args": tool_args,
                "output": tool_output
            })
        model_response = result.content.strip() if result.content else ""
    else:
        model_response = result.content.strip() if result.content else ""

    return {
        "success": True,
        "sentence": req.sentence,
        "tool_calls": tool_calls_data,
        "model_response": model_response
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8090)
