
/**
 * Creates a flow logger that appends timestamped events to the provided output.
 * @param {*} output 
 * @returns 
 */
function createFlowLogger(output) {
    /**
     * @param {string} event
     */
    return (event) => {
        output.appendLine(`[${new Date().toISOString()}] ${event}`);
    };
}

module.exports = { createFlowLogger };
