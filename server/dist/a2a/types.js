"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HathapUser = void 0;
exports.getUserId = getUserId;
class HathapUser {
    constructor(userId, name) {
        this.userId = userId;
        this.name = name;
    }
    get isAuthenticated() {
        return true;
    }
    get userName() {
        return this.name;
    }
}
exports.HathapUser = HathapUser;
function getUserId(user) {
    if (user instanceof HathapUser) {
        return user.userId;
    }
    return undefined;
}
