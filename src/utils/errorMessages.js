/**
 * What to tell a user when something fails. API errors carry the API's own explanation, which is
 * written for people ("Labels are turned off on this server."); everything else gets a generic
 * message, and the details go to the log instead.
 *
 * @param {unknown} error
 * @returns {{ title: string, body: string, unexpected: boolean }}
 */
function describeError(error) {
    if (error && error.name === "ApiError") {
        const message = typeof error.message === "string" ? error.message : "";
        switch (error.status) {
            case 0:
                return { title: "KanbanCord is unreachable", body: "Try again in a moment.", unexpected: true };
            case 401:
                return {
                    title: "Could not act for you",
                    body: "The bot is not set up to act for users right now. Try the website instead.",
                    unexpected: true,
                };
            case 403:
                return { title: "Not allowed", body: message || "You do not have permission to do that.", unexpected: false };
            case 404:
                return { title: "Not found", body: message || "That no longer exists.", unexpected: false };
            case 429:
                return { title: "Slow down", body: message || "Too many requests; try again shortly.", unexpected: false };
            default:
                if (error.status >= 500) {
                    return { title: "KanbanCord had a problem", body: "Try again in a moment.", unexpected: true };
                }
                return { title: "That did not work", body: message || "The request was refused.", unexpected: false };
        }
    }
    if (error && error.name === "UserFacingError") {
        return { title: error.title, body: error.message, unexpected: false };
    }
    return { title: "Something went wrong", body: "Try again in a moment.", unexpected: true };
}

/** An error whose message is meant for the user as is, raised by services for expected failures. */
class UserFacingError extends Error {
    constructor(title, message) {
        super(message);
        this.name = "UserFacingError";
        this.title = title;
    }
}

module.exports = { describeError, UserFacingError };
