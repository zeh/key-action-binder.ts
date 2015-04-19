/// <reference path="BindingInfo.ts" />
/// <reference path="./../libs/signals/SimpleSignal.ts" />
/// <reference path="./../definitions/gamepad.d.ts" />

/**
 * Provides universal input control for game controllers and keyboard
 * More info: https://github.com/zeh/key-action-binder.ts
 *
 * @author zeh fernando
 */
class KeyActionBinder {

	// Constants
	public static VERSION:String = "0.0.0";

	//public static const KEYBOARD_DEVICE:GameInputDevice = null;		// Set to null by default, since gamepads are non-null (and you can't create/subclass a GameInputDevice)

	public static GAMEPAD_INDEX_ANY:number = 81653811;
	public static KEY_CODE_ANY:string = "any";
	public static KEY_LOCATION_ANY:number = 81653813;

	// Properties
	private _isRunning:boolean;
	private _maintainPlayerPositions:boolean;														// Whether it tries to keep player positions or not
	private _recentDevice:Gamepad;																	// The most recent device that sent an event

	// Instances
	private bindings:Array<KAB.BindingInfo>;														// Actual existing bindings, their action, and whether they're activated or not

	private _onActionActivated:zehfernando.signals.SimpleSignal<(action: string) => void>;
	private _onActionDeactivated:zehfernando.signals.SimpleSignal<(action: string) => void>;
	private _onActionValueChanged:zehfernando.signals.SimpleSignal<(action: string, value:number) => void>;
	private _onDevicesChanged:zehfernando.signals.SimpleSignal<() => void>;
	private _onRecentDeviceChanged:zehfernando.signals.SimpleSignal<(gamepad: Gamepad) => void>; // TODO: use a Gamepad wrapper?

	private gameInputDevices:Array<Gamepad>;
	private gameInputDeviceIds:Array<String>;

	private bindCache: any; // Should have been "{ [index: Function]: Function }", but that's not allowed

	// TODO:
	// * Check navigator.getGamepads to see if gamepads are actually accessible


	// ================================================================================================================
	// CONSTRUCTOR ----------------------------------------------------------------------------------------------------

	constructor() {
		this.bindCache = {};

		this._isRunning = false;
		this._maintainPlayerPositions = false;
		this.bindings = new Array<KAB.BindingInfo>();
		//actionsActivations = {}; // TODO

		this._onActionActivated = new zehfernando.signals.SimpleSignal<(action: string) => void>();
		this._onActionDeactivated = new zehfernando.signals.SimpleSignal<(action: string) => void>();
		this._onActionValueChanged = new zehfernando.signals.SimpleSignal<(action: string, value: number) => void>();
		this._onDevicesChanged = new zehfernando.signals.SimpleSignal<() => void>();
		this._onRecentDeviceChanged = new zehfernando.signals.SimpleSignal<(gamepad: Gamepad) => void>();

		this.gameInputDevices = [];
		this.gameInputDeviceIds = [];

		//gameInputDevices = new Vector.<GameInputDevice>();
		//gameInputDeviceIds = new Vector.<String>();
		//gameInputDeviceDefinitions = new Vector.<AutoGamepadInfo>();

		this.start();
	}

	// ================================================================================================================
	// PUBLIC INTERFACE -----------------------------------------------------------------------------------------------

	/**
	 * Starts listening for input events.
	 *
	 * <p>This happens by default when a KeyActionBinder object is instantiated; this method is only useful if
	 * called after <code>stop()</code> has been used.</p>
	 *
	 * <p>Calling this method when a KeyActionBinder instance is already running has no effect.</p>
	 *
	 * @see #isRunning
	 * @see #stop()
	 */
	public start(): void {
		if (!this._isRunning) {
			// Starts listening to keyboard events
			window.addEventListener("keydown", this.getBoundFunction(this.onKeyDown));
			window.addEventListener("keyup", this.getBoundFunction(this.onKeyUp));

			// Starts listening to device change events
			window.addEventListener("gamepadconnected", this.getBoundFunction(this.onGameInputDeviceAdded));
			window.addEventListener("gamepaddisconnected", this.getBoundFunction(this.onGameInputDeviceRemoved));

			this.refreshGameInputDeviceList();

			this._isRunning = true;
		}
	}

	/**
	 * Stops listening for input events.
	 *
	 * <p>Action bindings are not lost when a KeyActionBinder instance is stopped; it merely starts ignoring
	 * all input events, until <code>start()<code> is called again.</p>
	 *
	 * <p>This method should always be called when you don't need a KeyActionBinder instance anymore, otherwise
	 * it'll be listening to events indefinitely.</p>
	 *
	 * <p>Calling this method when this a KeyActionBinder instance is already stopped has no effect.</p>
	 *
	 * @see #isRunning
	 * @see #start()
	 */
	public stop(): void {
		if (this._isRunning) {
			// Stops listening to keyboard events
			window.removeEventListener("keydown", this.getBoundFunction(this.onKeyDown));
			window.removeEventListener("keyup", this.getBoundFunction(this.onKeyUp));

			// Stops listening to device change events
			window.removeEventListener("gamepadconnected", this.getBoundFunction(this.onGameInputDeviceAdded));
			window.removeEventListener("gamepaddisconnected", this.getBoundFunction(this.onGameInputDeviceRemoved));

			//gameInputDevices.length = 0;
			//gameInputDeviceDefinitions.length = 0;
			//removeGameInputDeviceEvents();

			this._isRunning = false;
		}
	}

	/**
	 * Adds an action bound to a keyboard key. When a key with the given <code>keyCode</code> is pressed, the
	 * desired action is activated. Optionally, keys can be restricted to a specific <code>keyLocation</code>.
	 *
	 * @param action		An arbitrary String id identifying the action that should be dispatched once this
	 *						key combination is detected.
	 * @param keyCode		The code of a key, as expressed in AS3's Keyboard constants.
	 * @param keyLocation	The code of a key's location, as expressed in AS3's KeyLocation constants. If the
	 *						default value is passed, the key location is never taken into
	 *						consideration when detecting whether the passed action should be fired.
	 *
	 * <p>Examples:</p>
	 *
	 * <pre>
	 * // Left arrow key to move left
	 * myBinder.addKeyboardActionBinding("move-left", Keyboard.LEFT);
	 *
	 * // SPACE key to jump
	 * myBinder.addKeyboardActionBinding("jump", Keyboard.SPACE);
	 *
	 * // Any SHIFT key to shoot
	 * myBinder.addKeyboardActionBinding("shoot", Keyboard.SHIFT);
	 *
	 * // Left SHIFT key to boost
	 * myBinder.addKeyboardActionBinding("boost", Keyboard.SHIFT, KeyLocation.LEFT);
	 * </pre>
	 *
	 * @see flash.ui.Keyboard
	 * @see #isActionActivated()
	 * @see #removeKeyboardActionBinding()
	 */
	public addKeyboardActionBinding(action:string, keyCode:string = KeyActionBinder.KEY_CODE_ANY, keyLocation:number = KeyActionBinder.KEY_LOCATION_ANY):void {
		// Create a binding to be verified later
		this.bindings.push(new KAB.BindingInfo(action, new KAB.KeyboardBinding(keyCode, keyLocation)));
		this.prepareAction(action);
	}

	/**
	 * Removes an action bound to a keyboard key.
	 *
	 * @param action		An arbitrary String id identifying the action that should be dispatched once this
	 *						key combination is detected.
	 * @param keyCode		The code of a key, as expressed in AS3's Keyboard constants.
	 * @param keyLocation	The code of a key's location, as expressed in AS3's KeyLocation constants. If the
	 *						default value is passed, the key location is never taken into
	 *						consideration when detecting whether the passed action should be fired.
	 *
	 * @see flash.ui.Keyboard
	 * @see #addGamepadActionBinding()
	 */
	public removeKeyboardActionBinding(action:string, keyCode:string = KeyActionBinder.KEY_CODE_ANY, keyLocation:number = KeyActionBinder.KEY_LOCATION_ANY):void {
		var bindingsToRemove:Array<KAB.BindingInfo> = new Array<KAB.BindingInfo>();

		this.bindings.forEach(function (bindingInfo, i) {
			if (bindingInfo.action == action) {
				var keyboardBinding:KAB.KeyboardBinding = <KAB.KeyboardBinding>bindingInfo.binding;
				if (keyboardBinding != null && keyboardBinding.keyCode == keyCode && keyboardBinding.keyLocation == keyLocation) {
					// Store the binding to remove later, and fake a deactivate event
					bindingsToRemove[bindingsToRemove.length] = bindingInfo;
					//this.onKeyUp(new KeyboardEvent(KeyboardEvent.KEY_UP, true, false, 0, __keyCode, __keyLocation));
					// TODO: properly inject this
				}
			}
		});

		bindingsToRemove.forEach(function (bindingInfo, i) {
			this.bindings.splice(this.bindings.indexOf(bindingInfo), 1);
		});

		this.consumeAction(action);
	}

	/**
	 * Adds an action bound to a game controller button, trigger, or axis. When a control of id
	 * <code>controlId</code> is pressed, the desired action can be activated, and its value changes.
	 * Optionally, keys can be restricted to a specific game controller location.
	 *
	 * @param action		An arbitrary String id identifying the action that should be dispatched once this
	 *						input combination is detected.
	 * @param controlId		The id code of a GameInput control, as an String. Use one of the constants from
	 *						<code>GamepadControls</code>.
	 * @param gamepadIndex	The int of the gamepad that you want to restrict this action to. Use 0 for the
	 *						first gamepad (player 1), 1 for the second one, and so on. If the default value
	 *						is passed, the gamepad index is never taken into consideration when detecting
	 *						whether the passed action should be fired.
	 *
	 * <p>Examples:</p>
	 *
	 * <pre>
	 * // Direction pad left to move left
	 * myBinder.addGamepadActionBinding("move-left", GamepadControls.DPAD_LEFT);
	 *
	 * // Action button "down" (O in the OUYA, Cross in the PS3, A in the XBox 360) to jump
	 * myBinder.addGamepadActionBinding("jump", GamepadControls.ACTION_DOWN);
	 *
	 * // L1/LB to shoot, on any controller
	 * myBinder.addGamepadActionBinding("shoot", GamepadControls.LB);
	 *
	 * // L1/LB to shoot, on the first controller only
	 * myBinder.addGamepadActionBinding("shoot-player-1", GamepadControls.LB, 0);
	 *
	 * // L2/LT to shoot, regardless of whether it is sensitive or not
	 * myBinder.addGamepadActionBinding("shoot", GamepadControls.LT);
	 *
	 * // L2/LT to accelerate, depending on how much it is pressed (if supported)
	 * myBinder.addGamepadActionBinding("accelerate", GamepadControls.LT);
	.*
	 * // Direction pad left to move left or right
	 * myBinder.addGamepadActionBinding("move-sides", GamepadControls.STICK_LEFT_X);
	 * </pre>
	 *
	 * @see GamepadControls
	 * @see #isActionActivated()
	 * @see #getActionValue()
	 * @see #removeGamepadActionBinding()
	 */
	public addGamepadActionBinding(action:string, controlId:string, gamepadIndex:number = KeyActionBinder.GAMEPAD_INDEX_ANY):void {
		// Create a binding to be verified later
		this.bindings.push(new KAB.BindingInfo(action, new KAB.GamepadBinding(controlId, gamepadIndex)));
		this.prepareAction(action);
	}

	/**
	 * Removes an action bound to a game controller button, trigger, or axis.
	 *
	 * @param action		An arbitrary String id identifying the action that should be no longer bound.
	 * @param controlId		The id code of a GameInput control, as an String. Use one of the constants from
	 *						<code>GamepadControls</code>.
	 * @param gamepadIndex	The int of the gamepad that you want to restrict this action to. Use 0 for the
	 *						first gamepad (player 1), 1 for the second one, and so on. If the default value
	 *						is passed, the gamepad index is never taken into consideration when detecting
	 *						whether the passed action should be fired.
	 *
	 * @see GamepadControls
	 * @see #addGamepadActionBinding()
	 */
	public removeGamepadActionBinding(action:string, controlId:string, __gamepadIndex:number = KeyActionBinder.GAMEPAD_INDEX_ANY):void {
		var bindingsToRemove:Array<KAB.BindingInfo> = new Array<KAB.BindingInfo>();
		this.bindings.forEach(function (bindingInfo, i) {
			if (bindingInfo.action == action) {
				var gamepadBinding:KAB.GamepadBinding = <KAB.GamepadBinding>bindingInfo.binding;
				if (gamepadBinding != null && gamepadBinding.controlId == controlId && gamepadBinding.gamepadIndex == gamepadIndex) {
					// Store the binding to remove later, and fake a deactivate event
					bindingsToRemove[bindingsToRemove.length] = bindingInfo;
					//interpretGameInputControlChanges(gamepadBinding.controlId, 0, 0, 1, 0);
					// TODO: properly inject this
				}
			}
		});

		bindingsToRemove.forEach(function (bindingInfo, i) {
			this.bindings.splice(this.bindings.indexOf(bindingInfo), 1);
		});

		this.consumeAction(action);
	}

	/**
	 * Update the known state of all buttons/axis
	 */
	public update(): void {
		// TODO: check controls to see if any has changed
		// TODO: move this outside? make it automatic (with requestAnimationFrame), or make it be called once per frame when any action is checked
	}


	// ================================================================================================================
	// ACCESSOR INTERFACE ---------------------------------------------------------------------------------------------

	public get onActionActivated() {
		return this._onActionActivated;
	}

	public get onActionDeactivated() {
		return this._onActionDeactivated;
	}

	public get onActionValueChanged() {
		return this._onActionValueChanged;
	}

	public get onDevicesChanged() {
		return this._onDevicesChanged;
	}

	public get onRecentDeviceChanged() {
		return this._onRecentDeviceChanged;
	}

	/**
	 * Whether this KeyActionBinder instance is running, or not. This property is read-only.
	 *
	 * @see #start()
	 * @see #stop()
	 */
	public get isRunning(): boolean {
		return this._isRunning;
	}


	// ================================================================================================================
	// EVENT INTERFACE ------------------------------------------------------------------------------------------------

	private onKeyDown(e: KeyboardEvent): void {
		console.error("NOT IMPLEMENTED: onKeyDown");
	}

	private onKeyUp(e: KeyboardEvent): void {
		console.error("NOT IMPLEMENTED: onKeyUp");
	}

	private onGameInputDeviceAdded(e: GamepadEvent): void {
		console.error("NOT IMPLEMENTED: onGameInputDeviceAdded");
	}

	private onGameInputDeviceRemoved(e: GamepadEvent): void {
		console.error("NOT IMPLEMENTED: onGameInputDeviceRemoved");
	}

	// ================================================================================================================
	// PRIVATE INTERFACE ----------------------------------------------------------------------------------------------

	private refreshGameInputDeviceList(): void {
		// The list of game devices has changed

		if (false) {
		//if (this._maintainPlayerPositions && gameInputDeviceIds != null) {
			// TODO: implement this
			/*
			// Will try to maintain player positions:
			// * A removed device will continue to exist in the list (as a null device), unless it's the latest device
			// * An added device will try to be added to its previously existing position, if one can be found
			// * If a previously existing position cannot be found, the device takes the first available position

			var gamepadPosition: int;

			// Creates a list of all the new ids
			var newGamepadIds: Vector.<String> = new Vector.<String>();
			var newGamepads: Vector.<GameInputDevice> = new Vector.<GameInputDevice>();
			for (i = 0; i < GameInput.numDevices; i++) {
				if (GameInput.getDeviceAt(i) != null) {
					newGamepadIds.push(GameInput.getDeviceAt(i).id);
					newGamepads.push(GameInput.getDeviceAt(i));
				}
			}

			// Create a list of available slots for insertion
			var availableSlots: Vector.<int> = new Vector.<int>();

			// First, check for removed items
			// Goes backward, so it can remove items from the list
			var isEndPure: Boolean = true;
			i = gameInputDeviceIds.length - 1;
			while (i >= 0) {
				gamepadPosition = newGamepadIds.indexOf(gameInputDeviceIds[i]);
				if (gamepadPosition < 0) {
					// This device id doesn't exist in the new list, therefore it's removed
					if (isEndPure) {
						// But since it's in the end of the list, actually remove it
						gameInputDeviceIds.splice(i, 1);
					} else {
						// It's in the middle of the list, so just mark that spot as available
						availableSlots.push(i);
					}
				} else {
					// This device id exists in the list, so ignore and assume it's not in the end anymore
					isEndPure = false;
				}
				i--;
			}

			// Now, add new items that are not in the list
			for (i = 0; i < newGamepadIds.length; i++) {
				gamepadPosition = gameInputDeviceIds.indexOf(newGamepadIds[i]);
				if (gamepadPosition < 0) {
					// This gamepad is not in the list, so add it
					if (availableSlots.length > 0) {
						// Add it in the first available slot
						gameInputDeviceIds.push(newGamepadIds[availableSlots[0]]);
						availableSlots.splice(0, 1);
					} else {
						// No more slots availabloe, add it at the end
						gameInputDeviceIds.push(newGamepadIds[i]);
					}
				}
			}

			// Now that gameInputDeviceIds is correct, just create the list of references
			gameInputDevices.length = gameInputDeviceIds.length;
			gameInputDeviceDefinitions.length = gameInputDeviceIds.length;
			for (i = 0; i < gameInputDeviceIds.length; i++) {
				gamepadPosition = newGamepadIds.indexOf(gameInputDeviceIds[i]);
				if (gamepadPosition < 0) {
					// A spot for a gamepad that was just removed
					gameInputDevices[i] = null;
					gameInputDeviceDefinitions[i] = null;
				} else {
					// A normal game input device
					gameInputDevices[i] = newGamepads[gamepadPosition];
					gameInputDeviceDefinitions[i] = findGamepadInfo(newGamepads[gamepadPosition]);
				}
			}
			*/
		} else {
			// Full refresh: create a new list of devices
			var gamepads: Array<Gamepad> = navigator.getGamepads();

			this.gameInputDevices.length = gamepads.length;
			this.gameInputDeviceIds.length = gamepads.length;
			//this.gameInputDeviceDefinitions.length = GameInput.numDevices; // TODO: clear this if not needed, since browser

			// This check is necessary because empty gamepads are left behind when removed
			// TODO: test this to see if it's actually needed to keep track of the devices
			for (var i = 0; i < gamepads.length; i++) {
				if (this.gameInputDevices[i] != null) {
					this.gameInputDevices[i] = gamepads[i];
					this.gameInputDeviceIds[i] = gamepads[i].id;
					//gameInputDeviceDefinitions[i] = findGamepadInfo(gameInputDevices[i]); // TODO: clear this if not needed, since the browser already maps it
				} else {
					this.gameInputDeviceIds[i] = null;
					//gameInputDeviceDefinitions[i] = null; // TODO: clear this if not needed, since the browser already maps it
				}
			}
		}

		// Dispatch the signal
		this._onDevicesChanged.dispatch();
	}

	/**
	 * Utility function: creates a function bound to "this". This is needed because the same reference needs to be used when removing listeners.
	 */
	private getBoundFunction(func:any): EventListener {
		if (!this.bindCache.hasOwnProperty(func)) {
			this.bindCache[func] = func.bind(this);
		}
		return this.bindCache[func];
	}
	
}