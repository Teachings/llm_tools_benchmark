document.addEventListener('DOMContentLoaded', () => {
    const bodyEl = document.body;
    const darkModeToggle = document.getElementById('darkModeToggle');

    const llm1BaseURLInput = document.getElementById('llm1BaseURL');
    const llm1ModelNameInput = document.getElementById('llm1ModelName');
    const llm2BaseURLInput = document.getElementById('llm2BaseURL');
    const llm2ModelNameInput = document.getElementById('llm2ModelName');
    const testSuiteSizeInput = document.getElementById('testSuiteSize');
    const generateSentencesBtn = document.getElementById('generateSentencesBtn');
    const startBenchmarkBtn = document.getElementById('startBenchmarkBtn');
    const enableLoggingCheck = document.getElementById('enableLogging');
    const sentencesTableBody = document.querySelector('#sentencesTable tbody');

    const llm1Header = document.getElementById('llm1Header');
    const llm1ProgressText = document.getElementById('llm1ProgressText');
    const llm1ProgressBar = document.getElementById('llm1ProgressBar');
    const llm1SuccessCountElem = document.getElementById('llm1SuccessCount');
    const llm1FailureCountElem = document.getElementById('llm1FailureCount');
    const llm1Results = document.getElementById('llm1Results');
    const llm1AvgTimeElem = document.getElementById('llm1AvgTime');
    const llm1CurrentSection = document.getElementById('llm1CurrentSection');
    const llm1CurrentSentenceElem = document.getElementById('llm1CurrentSentence');
    const llm1CurrentResponseElem = document.getElementById('llm1CurrentResponse');
    const llm1PauseBtn = document.getElementById('llm1PauseBtn');
    const llm1ResumeBtn = document.getElementById('llm1ResumeBtn');
    const llm1StopBtn = document.getElementById('llm1StopBtn');

    const llm2CardContainer = document.getElementById('llm2CardContainer');
    const llm2Header = document.getElementById('llm2Header');
    const llm2ProgressText = document.getElementById('llm2ProgressText');
    const llm2ProgressBar = document.getElementById('llm2ProgressBar');
    const llm2SuccessCountElem = document.getElementById('llm2SuccessCount');
    const llm2FailureCountElem = document.getElementById('llm2FailureCount');
    const llm2Results = document.getElementById('llm2Results');
    const llm2AvgTimeElem = document.getElementById('llm2AvgTime');
    const llm2CurrentSection = document.getElementById('llm2CurrentSection');
    const llm2CurrentSentenceElem = document.getElementById('llm2CurrentSentence');
    const llm2CurrentResponseElem = document.getElementById('llm2CurrentResponse');
    const llm2PauseBtn = document.getElementById('llm2PauseBtn');
    const llm2ResumeBtn = document.getElementById('llm2ResumeBtn');
    const llm2StopBtn = document.getElementById('llm2StopBtn');

    const totalTimeElem = document.getElementById('totalTime');
    const logsCard = document.getElementById('logsCard');
    const logsContainer = document.getElementById('logsContainer');

    // Add Clear Logs button
    const logsCardHeader = logsCard.querySelector('.card-header');
    const clearLogsBtn = document.createElement('button');
    clearLogsBtn.className = 'btn btn-sm btn-outline-secondary ms-3';
    clearLogsBtn.textContent = 'Clear Logs';
    clearLogsBtn.addEventListener('click', () => {
        logsContainer.innerHTML = '';
    });
    logsCardHeader.appendChild(clearLogsBtn);

    // Updated test requests logic
    const citiesAndStates = [
        "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
        "Miami, FL", "San Francisco, CA", "Seattle, WA", "Boston, MA",
        "Austin, TX", "Denver, CO", "Philadelphia, PA", "Phoenix, AZ",
        "Dallas, TX", "San Diego, CA", "Atlanta, GA", "Washington D.C., DC",
        "Orlando, FL", "Nashville, TN", "Minneapolis, MN", "Las Vegas, NV"
    ];

    const weatherRequests = [
        "What is the weather today in [location]?",
        "Can you tell me the forecast for tomorrow in [location]?",
        "How's the weather in [location] today?",
        "What's the temperature like right now in [location]?",
        "Tell me about the conditions for tonight in [location]?",
        "Is it going to rain tomorrow in [location]?"
    ];

    // No-tool requests (expected_tool = none)
    const noToolRequests = [
        "Tell me a joke.",
        "What is 2+2?",
        "Describe a beautiful sunset.",
        "Give me a fun fact about penguins."
    ];

    let testSentences = []; // {sentence: string, expected_tool: string}
    let loggingEnabled = false;

    let llm1Paused = false;
    let llm2Paused = false;
    let llm1Stopped = false;
    let llm2Stopped = false;

    darkModeToggle.addEventListener('change', () => {
        if (darkModeToggle.checked) {
            bodyEl.classList.add('dark-mode');
        } else {
            bodyEl.classList.remove('dark-mode');
        }
    });

    generateSentencesBtn.addEventListener('click', () => {
        const size = parseInt(testSuiteSizeInput.value, 10);
        if (isNaN(size) || size < 1) {
            alert("Please enter a valid test suite size.");
            return;
        }

        testSentences = [];
        sentencesTableBody.innerHTML = '';
        
        for (let i = 0; i < size; i++) {
            // 25% chance to pick from noToolRequests
            const useNoTool = Math.random() < 0.25;
            if (useNoTool) {
                const sentenceTemplate = noToolRequests[Math.floor(Math.random() * noToolRequests.length)];
                testSentences.push({
                    sentence: sentenceTemplate,
                    expected_tool: "none"
                });
            } else {
                const sentenceTemplate = weatherRequests[Math.floor(Math.random() * weatherRequests.length)];
                const location = citiesAndStates[Math.floor(Math.random() * citiesAndStates.length)];
                const sentence = sentenceTemplate.replace("[location]", location);
                testSentences.push({
                    sentence: sentence,
                    expected_tool: "get_current_weather"
                });
            }
        }

        renderTestSentences();
        startBenchmarkBtn.disabled = false;
    });

    function renderTestSentences() {
        sentencesTableBody.innerHTML = '';

        testSentences.forEach((item, index) => {
            const row = document.createElement('tr');

            // Index
            const idxCell = document.createElement('td');
            idxCell.textContent = index + 1;

            // Sentence cell (editable)
            const sentenceCell = document.createElement('td');
            sentenceCell.textContent = item.sentence;

            // Edit sentence button cell
            const editSentenceCell = document.createElement('td');
            const editSentenceBtn = document.createElement('button');
            editSentenceBtn.className = 'btn btn-sm btn-outline-secondary';
            editSentenceBtn.innerHTML = `<i class="bi bi-pencil-square"></i>`;
            editSentenceBtn.addEventListener('click', () => startEditSentence(row, index));
            editSentenceCell.appendChild(editSentenceBtn);

            // Expected Tool cell (dropdown)
            const expectedToolCell = document.createElement('td');
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm';
            // Two options: none or get_current_weather
            const optionNone = document.createElement('option');
            optionNone.value = 'none';
            optionNone.textContent = 'none';
            const optionWeather = document.createElement('option');
            optionWeather.value = 'get_current_weather';
            optionWeather.textContent = 'get_current_weather';

            select.appendChild(optionNone);
            select.appendChild(optionWeather);
            select.value = item.expected_tool;

            select.addEventListener('change', () => {
                testSentences[index].expected_tool = select.value;
            });

            expectedToolCell.appendChild(select);

            row.appendChild(idxCell);
            row.appendChild(sentenceCell);
            row.appendChild(editSentenceCell);
            row.appendChild(expectedToolCell);
            sentencesTableBody.appendChild(row);
        });
    }

    function startEditSentence(row, index) {
        const sentenceCell = row.cells[1];
        const originalText = sentenceCell.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control form-control-sm';
        input.value = originalText;
        sentenceCell.innerHTML = '';
        sentenceCell.appendChild(input);
        input.focus();

        function finishEdit() {
            const newVal = input.value.trim();
            testSentences[index].sentence = newVal;
            sentenceCell.textContent = newVal;
        }

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishEdit();
            }
        });
    }

    startBenchmarkBtn.addEventListener('click', async () => {
        startBenchmarkBtn.disabled = true;

        const llm1Base = llm1BaseURLInput.value.trim();
        const llm1Model = llm1ModelNameInput.value.trim();
        const llm2Base = llm2BaseURLInput.value.trim();
        const llm2Model = llm2ModelNameInput.value.trim();

        if (!llm1Base || !llm1Model) {
            alert("Please provide at least LLM 1 Base URL and Model Name.");
            startBenchmarkBtn.disabled = false;
            return;
        }

        llm1Header.innerHTML = `<i class="bi bi-cpu me-2"></i>${llm1Model} Results`;
        if (llm2Base && llm2Model) {
            llm2Header.innerHTML = `<i class="bi bi-cpu me-2"></i>${llm2Model} Results`;
        }

        resetLLMResults(1);
        resetLLMResults(2);

        if (llm2Base && llm2Model) {
            llm2CardContainer.style.display = "block";
        } else {
            llm2CardContainer.style.display = "none";
        }

        loggingEnabled = enableLoggingCheck.checked;
        logsCard.style.display = loggingEnabled ? 'block' : 'none';
        logsContainer.innerHTML = '';

        llm1Paused = false;
        llm2Paused = false;
        llm1Stopped = false;
        llm2Stopped = false;

        llm1PauseBtn.disabled = false;
        llm1ResumeBtn.disabled = true;
        llm1StopBtn.disabled = false;

        llm2PauseBtn.disabled = false;
        llm2ResumeBtn.disabled = true;
        llm2StopBtn.disabled = false;

        const startTime = Date.now();
        console.log(`[${Date.now()}] Starting benchmarks with testSentences size = ${testSentences.length}`);

        const tasks = [];
        tasks.push(runBenchmarkForLLM(1, llm1Base, llm1Model, testSentences));
        if (llm2Base && llm2Model) {
            tasks.push(runBenchmarkForLLM(2, llm2Base, llm2Model, testSentences));
        }

        await Promise.all(tasks);

        const endTime = Date.now();
        const totalTime = endTime - startTime;
        totalTimeElem.textContent = `${totalTime.toFixed(2)} ms`;
        console.log(`[${Date.now()}] All benchmarks completed. Total time: ${totalTime.toFixed(2)} ms`);

        // Allow rerun
        startBenchmarkBtn.disabled = false;
    });

    llm1PauseBtn.addEventListener('click', () => {
        llm1Paused = true;
        llm1PauseBtn.disabled = true;
        llm1ResumeBtn.disabled = false;
        console.log(`[${Date.now()}] Paused LLM1`);
    });

    llm1ResumeBtn.addEventListener('click', () => {
        llm1Paused = false;
        llm1PauseBtn.disabled = false;
        llm1ResumeBtn.disabled = true;
        console.log(`[${Date.now()}] Resumed LLM1`);
    });

    llm1StopBtn.addEventListener('click', () => {
        llm1Stopped = true;
        llm1PauseBtn.disabled = true;
        llm1ResumeBtn.disabled = true;
        llm1StopBtn.disabled = true;
        console.log(`[${Date.now()}] Stopped LLM1`);
    });

    llm2PauseBtn.addEventListener('click', () => {
        llm2Paused = true;
        llm2PauseBtn.disabled = true;
        llm2ResumeBtn.disabled = false;
        console.log(`[${Date.now()}] Paused LLM2`);
    });

    llm2ResumeBtn.addEventListener('click', () => {
        llm2Paused = false;
        llm2PauseBtn.disabled = false;
        llm2ResumeBtn.disabled = true;
        console.log(`[${Date.now()}] Resumed LLM2`);
    });

    llm2StopBtn.addEventListener('click', () => {
        llm2Stopped = true;
        llm2PauseBtn.disabled = true;
        llm2ResumeBtn.disabled = true;
        llm2StopBtn.disabled = true;
        console.log(`[${Date.now()}] Stopped LLM2`);
    });

    async function runBenchmarkForLLM(llmNumber, baseURL, modelName, sentences) {
        console.log(`[${Date.now()}] LLM${llmNumber} starting processing ${sentences.length} sentences.`);
        let successCount = 0;
        let failureCount = 0;
        let totalResponseTime = 0; // Will accumulate server-reported time_taken

        const isLLM1 = (llmNumber === 1);
        const currentSection = isLLM1 ? llm1CurrentSection : llm2CurrentSection;
        const currentSentenceElem = isLLM1 ? llm1CurrentSentenceElem : llm2CurrentSentenceElem;
        const currentResponseElem = isLLM1 ? llm1CurrentResponseElem : llm2CurrentResponseElem;
        const successCountElem = isLLM1 ? llm1SuccessCountElem : llm2SuccessCountElem;
        const failureCountElem = isLLM1 ? llm1FailureCountElem : llm2FailureCountElem;
        const progressBar = isLLM1 ? llm1ProgressBar : llm2ProgressBar;
        const progressText = isLLM1 ? llm1ProgressText : llm2ProgressText;
        const resultsList = isLLM1 ? llm1Results : llm2Results;
        const avgTimeElem = isLLM1 ? llm1AvgTimeElem : llm2AvgTimeElem;

        const pauseVar = isLLM1 ? () => llm1Paused : () => llm2Paused;
        const stopVar = isLLM1 ? () => llm1Stopped : () => llm2Stopped;

        for (let i = 0; i < sentences.length; i++) {
            if (stopVar()) {
                console.log(`[${Date.now()}] LLM${llmNumber} stopped before sentence #${i+1}`);
                break;
            }

            while (pauseVar() && !stopVar()) {
                await sleep(100);
            }

            if (stopVar()) {
                console.log(`[${Date.now()}] LLM${llmNumber} stopped after resume check before sentence #${i+1}`);
                break;
            }

            const {sentence, expected_tool} = sentences[i];
            console.log(`[${Date.now()}] LLM${llmNumber} starting sentence #${i+1}: "${sentence}" (expected_tool: ${expected_tool})`);

            highlightSentence(i, true);
            currentSection.style.display = 'block';
            currentSentenceElem.textContent = `"${sentence}"`;
            currentResponseElem.textContent = '...waiting for response';

            const payload = {
                base_url: baseURL,
                model_name: modelName,
                sentence: sentence,
                expected_tool: expected_tool
            };

            let data;
            try {
                const response = await fetch('/benchmark', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                data = await response.json();
            } catch (err) {
                data = { success: false, sentence, error: err.message };
            }

            let elapsed = data.time_taken !== undefined ? data.time_taken : 0;
            totalResponseTime += elapsed;

            console.log(`[${Date.now()}] LLM${llmNumber} received response for sentence #${i+1} in ${elapsed} ms`, data);

            if (loggingEnabled) {
                const logEntry = {
                    llm: llmNumber,
                    sentence_index: i+1,
                    request: payload,
                    response: data,
                    time_ms: elapsed.toString()
                };
                const entryDiv = document.createElement('div');
                entryDiv.classList.add('log-entry');
                entryDiv.textContent = JSON.stringify(logEntry, null, 2);
                logsContainer.appendChild(entryDiv);
            }

            if (data.success) {
                successCount++;
                const respText = data.model_response && data.model_response.trim().length > 0 ? data.model_response : "No response";
                currentResponseElem.textContent = respText;

                highlightSentence(i, false, true);
                const li = document.createElement('li');
                li.classList.add('list-group-item');
                li.innerHTML = `<strong>#${i+1}:</strong> Success | <em>${elapsed} ms</em>`;
                resultsList.appendChild(li);
            } else {
                failureCount++;
                const errResp = `Error: ${data.error || 'Unknown'}`;
                currentResponseElem.textContent = errResp;

                highlightSentence(i, false, false);
                const li = document.createElement('li');
                li.classList.add('list-group-item', 'list-group-item-danger');
                li.innerHTML = `<strong>#${i+1}:</strong> Failed | <em>${elapsed} ms</em>`;
                resultsList.appendChild(li);
            }

            successCountElem.textContent = successCount;
            failureCountElem.textContent = failureCount;
            updateProgressBar(progressBar, progressText, (i+1), sentences.length);
            avgTimeElem.textContent = `${(totalResponseTime/(i+1)).toFixed(2)} ms`;

            while (pauseVar() && !stopVar()) {
                await sleep(100);
            }
            if (stopVar()) {
                console.log(`[${Date.now()}] LLM${llmNumber} stopped after second resume check at sentence #${i+1}`);
                break;
            }
        }

        currentSection.style.display = 'none';
        console.log(`[${Date.now()}] LLM${llmNumber} completed all sentences or stopped.`);
    }

    function resetLLMResults(llmNumber) {
        if (llmNumber === 1) {
            llm1SuccessCountElem.textContent = '0';
            llm1FailureCountElem.textContent = '0';
            llm1ProgressText.textContent = '0%';
            llm1ProgressBar.style.width = '0%';
            llm1Results.innerHTML = '';
            llm1AvgTimeElem.textContent = '0 ms';
            llm1CurrentSection.style.display = 'none';
        } else {
            llm2SuccessCountElem.textContent = '0';
            llm2FailureCountElem.textContent = '0';
            llm2ProgressText.textContent = '0%';
            llm2ProgressBar.style.width = '0%';
            llm2Results.innerHTML = '';
            llm2AvgTimeElem.textContent = '0 ms';
            llm2CurrentSection.style.display = 'none';
        }
    }

    function highlightSentence(index, processing, success = null) {
        const rows = sentencesTableBody.querySelectorAll('tr');
        const row = rows[index];
        if (!row) return;
        row.classList.remove('highlight-processing', 'highlight-completed-success', 'highlight-completed-failure');

        if (processing) {
            row.classList.add('highlight-processing');
        } else {
            if (success === true) {
                row.classList.add('highlight-completed-success');
            } else {
                row.classList.add('highlight-completed-failure');
            }
        }
    }

    function updateProgressBar(barElem, textElem, processed, total) {
        const percent = Math.round((processed / total) * 100);
        barElem.style.width = percent + '%';
        textElem.textContent = percent + '%';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
});
