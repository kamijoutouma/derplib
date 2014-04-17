"use strict";
// Require modules
var colors 	= require('colors'),
	_		= require('underscore');

var MM 		= module.parent,
	utils 	= MM.libary.load('utils'),
	db 		= MM.plugin.load('database');

/////////////////
// Permissions //

var perms = db.get('permissions');
var roleObject = {inherits: [],nodes: []};

// Settings
var defaultRole = false;
var admins = ['barrykun'];

if(!_.has(perms, 'nodes')) perms.nodes = {};
if(!_.has(perms, 'roles')) perms.roles = {};
if(!_.has(perms.nodes, 'cmd')) perms.nodes.cmd = {};

/* 
* // Permission Rules //
* A permission stands for an operation
* Permissions can either grant or deny access
* A role has permission objects
* Permissions are divided in (sub-)categories and one permission can grant or deny access to a whole category using [category].*
* A role can inherit permissions from different roles
* A user can be given a role which has set permissions
* A user can be given his own permissions
* A room can create its own roles (todo)
* A room can give roles and permissions to users (todo)
*/

exports.addRole = function(name, role){
	perms.roles[name] = _.extend(JSON.parse(JSON.stringify(roleObject)), role);
}

exports.addRole('admin', {
	nodes: [
		{ node: '*', grant: true },
	],
});

exports.setDefaultRole = function(role){
	if(_.has(perms.roles, role)){
		defaultRole = role;
	}
}

exports.register = function(key, nodes){
	if(!_.contains(nodes, 'run')){
		nodes.push('run');
	}
	perms.nodes.cmd[key] = nodes;
}

exports.request = function(args){
	var req = args[0];
	
	// Cannot create perm object for user, invalid default role
	if(!_.has(req.user.data, 'perms') && !_.has(perms.roles, defaultRole)) return false;
	if(!_.has(req.user.data, 'perms')) req.user.data.perms = {roles: [defaultRole], nodes: []};
	
	req.perm = function(node){
		if(!this.user || !this.user.data.perms) return false;
		if(~_.indexOf(admins, req.user.name)) return true;
		if(node.split('.').length !== 3 && node.indexOf('*') === -1) return false; // Invalid node name
		
		var userPerms = this.user.data.perms.nodes;
		var userRoles = _getRoleInherits(this.user.data.perms.roles);
		
		// Get the nodes from nodename
		var roleNodes = _.reduce(userRoles, function(list, role){
			if(!_.has(perms.roles, role)) return list;
			role = perms.roles[role];
			list.push.apply(list, role.nodes);
			return list;
		},[]);
		
		// Add user nodes and role nodes together
		roleNodes = _.flatten([userPerms, roleNodes]);
		
		// Create a lists for granting or not
		roleNodes = _.reduce(roleNodes, function(existing,x){
			var grant = undefined === x.grant ? true : x.grant;
			if(!~_.indexOf(existing.allowed, x.node) && grant === true)
				existing.allowed.push(x.node);
			else if(!~_.indexOf(existing.denied, x.node) && grant === false)
				existing.denied.push(x.node);
			return existing;
		},{allowed:[],denied:[]});
		
		var allowedNodes = _.uniq(roleNodes.allowed);
		var deniedNodes = _.uniq(roleNodes.denied);
		
		var allowed = _.reduce(allowedNodes, function(allowed, perm){
			return allowed || matchNode(node, perm);
		}, false);
		
		var denied = _.reduce(deniedNodes, function(allowed, perm){
			return allowed || matchNode(node, perm);
		}, false);
		
		return (allowed === true && denied === false);
	}
}

function matchNode(first, second){
	if(first == second) return true;
    
	var firstList = first.split('.');
	var secondList = second.split('.');
	
    //First
    if(firstList[0] == '*' || secondList[0] == '*') return true;
    // Second
    if( firstList.length > 1 && secondList.length > 1 && 
       firstList[0]+firstList[1] == secondList[0]+'*' || 
       firstList[0]+'*' == secondList[0]+secondList[1]) return true;
    // Third
    if( firstList.length > 2 && secondList.length > 2 && 
        firstList[0]+firstList[1]+firstList[2] == secondList[0]+secondList[1]+'*' ||        
        firstList[0]+firstList[1]+'*' == secondList[0]+secondList[1]+secondList[2]) return true;
    return false;
}

var _getRoleInherits = function(roles){
	_.each(roles, function(role){
		if(!perms.roles.hasOwnProperty(role)) return;
		role = perms.roles[role];
		if(role.inherits)
			roles.push.apply(roles,_getRoleInherits(role.inherits));
	});
	return roles;
}
