process.once('exit', () => {
    console.log('[Server] Exit event triggered');
});


process.on('uncaughtException', (error) => {
    console.error('[Server] UNCAUGHT EXCEPTION:', error.message);
    console.error(error.stack);

});


process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] UNHANDLED REJECTION:', reason);

});

try {
    require('./index.js');
    console.log('[Server] ✓ Server module loaded successfully');
} catch (error) {
    console.error('[Server] ✗ Failed to load server:', error.message);
    console.error(error.stack);
    process.exit(1);
}


const keepAliveInterval = setInterval(() => {

}, 30000);

keepAliveInterval.unref();


process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM signal received: closing HTTP server');
    clearInterval(keepAliveInterval);
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Server] SIGINT signal received: closing HTTP server');
    clearInterval(keepAliveInterval);
    process.exit(0);
});

console.log('[Server] Process monitoring active - backend will stay running');
